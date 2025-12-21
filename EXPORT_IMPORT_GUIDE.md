# MongoDB Database Export/Import Guide

This guide explains how to export databases from an old MongoDB server and import them into the new admin UI.

## Method 1: Using mongodump + mongorestore (Recommended for Large Databases)

### Export from Old Server

```bash
# Export entire database
mongodump --uri="mongodb://username:password@old-server:27017/database_name" --out=/path/to/backup

# Export with authentication database
mongodump --uri="mongodb://username:password@old-server:27017/database_name?authSource=admin" --out=/path/to/backup

# Export with TLS (if old server uses TLS)
mongodump --uri="mongodb://username:password@old-server:27017/database_name?tls=true&tlsCAFile=/path/to/ca.crt" --out=/path/to/backup
```

### Convert BSON to JSON for Admin UI

The admin UI imports JSON format. Convert BSON dumps to JSON:

```bash
# Install bsondump if not available
# bsondump is included with MongoDB tools

# Convert each collection
bsondump /path/to/backup/database_name/collection.bson > /path/to/backup/database_name/collection.json

# Or use a script to convert all collections
for file in /path/to/backup/database_name/*.bson; do
    collection=$(basename "$file" .bson)
    bsondump "$file" > "/path/to/backup/database_name/${collection}.json"
done
```

### Create Import JSON Format

The admin UI expects this format:

```json
{
  "database": "database_name",
  "exportedAt": "2025-12-21T00:00:00.000Z",
  "collections": {
    "collection1": [
      { "_id": "...", "field1": "value1" },
      { "_id": "...", "field2": "value2" }
    ],
    "collection2": [
      { "_id": "...", "field3": "value3" }
    ]
  }
}
```

### Script to Convert BSON Dump to Admin UI Format

```bash
#!/bin/bash
# convert-bson-to-admin-format.sh

DUMP_DIR="/path/to/backup/database_name"
DB_NAME="database_name"
OUTPUT_FILE="${DB_NAME}_export_$(date +%s).json"

echo "{" > "$OUTPUT_FILE"
echo "  \"database\": \"$DB_NAME\"," >> "$OUTPUT_FILE"
echo "  \"exportedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"," >> "$OUTPUT_FILE"
echo "  \"collections\": {" >> "$OUTPUT_FILE"

first=true
for bson_file in "$DUMP_DIR"/*.bson; do
    if [ -f "$bson_file" ]; then
        collection=$(basename "$bson_file" .bson)
        
        if [ "$first" = false ]; then
            echo "," >> "$OUTPUT_FILE"
        fi
        first=false
        
        echo "    \"$collection\": [" >> "$OUTPUT_FILE"
        
        # Convert BSON to JSON array
        bsondump "$bson_file" | jq -s '.' >> "$OUTPUT_FILE" 2>/dev/null || \
        bsondump "$bson_file" | sed 's/^/      /' | sed '$ s/$/,/' >> "$OUTPUT_FILE"
        
        echo "    ]" >> "$OUTPUT_FILE"
    fi
done

echo "  }" >> "$OUTPUT_FILE"
echo "}" >> "$OUTPUT_FILE"

echo "Export file created: $OUTPUT_FILE"
```

## Method 2: Using mongoexport (Easier, Direct JSON)

### Export from Old Server

```bash
# Export single collection
mongoexport --uri="mongodb://username:password@old-server:27017/database_name" \
  --collection=collection_name \
  --out=collection_name.json \
  --jsonArray

# Export all collections in a database
for collection in $(mongo --quiet --eval "db.getCollectionNames()" mongodb://username:password@old-server:27017/database_name); do
  mongoexport --uri="mongodb://username:password@old-server:27017/database_name" \
    --collection="$collection" \
    --out="${collection}.json" \
    --jsonArray
done
```

### Combine Collections into Admin UI Format

```bash
#!/bin/bash
# combine-collections.sh

DB_NAME="database_name"
OUTPUT_FILE="${DB_NAME}_export_$(date +%s).json"

echo "{" > "$OUTPUT_FILE"
echo "  \"database\": \"$DB_NAME\"," >> "$OUTPUT_FILE"
echo "  \"exportedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"," >> "$OUTPUT_FILE"
echo "  \"collections\": {" >> "$OUTPUT_FILE"

first=true
for json_file in *.json; do
    if [ -f "$json_file" ]; then
        collection=$(basename "$json_file" .json)
        
        if [ "$first" = false ]; then
            echo "," >> "$OUTPUT_FILE"
        fi
        first=false
        
        echo "    \"$collection\": " >> "$OUTPUT_FILE"
        cat "$json_file" >> "$OUTPUT_FILE"
    fi
done

echo "  }" >> "$OUTPUT_FILE"
echo "}" >> "$OUTPUT_FILE"

echo "Export file created: $OUTPUT_FILE"
```

## Method 3: Using MongoDB Compass (GUI Method)

1. **Connect to old server** in MongoDB Compass
2. **Select database** you want to export
3. For each collection:
   - Click on collection
   - Click "Export Collection"
   - Choose JSON format
   - Save file
4. **Combine files** using the script above or manually create the JSON structure

## Method 4: Using the Provided Export Script (Easiest!)

A ready-to-use export script is included in this project:

```bash
# Basic usage (no TLS)
node export-database.js "mongodb://username:password@old-server:27017/dbname"

# With TLS (like your new server)
node export-database.js "mongodb://username:password@old-server:27017/dbname?tls=true&tlsCAFile=./tls-certs/ca.crt&tlsAllowInvalidCertificates=true&authSource=admin"

# Specify output file
node export-database.js "mongodb://username:password@old-server:27017/dbname" output.json
```

**First time setup:**
```bash
# Install dependencies (one time)
npm install
```

The script automatically:
- ✅ Connects to the MongoDB server
- ✅ Exports all collections
- ✅ Creates JSON in the exact format the Admin UI expects
- ✅ Handles TLS connections
- ✅ Shows progress and statistics

## Import via Admin UI

1. **Access Admin UI**: `http://localhost:3000`
2. **Create database** (if needed): Click "+ New" button
3. **Click Import** on the database
4. **Select JSON file** (the export file you created)
5. **Choose options**:
   - Drop existing collections (if you want to replace data)
   - Keep existing (to merge data)
6. **Click Import**

## Quick Reference

### Export Single Collection (JSON)
```bash
mongoexport --uri="mongodb://user:pass@host:27017/db" \
  --collection=collection_name \
  --out=collection.json \
  --jsonArray
```

### Export Entire Database (BSON)
```bash
mongodump --uri="mongodb://user:pass@host:27017/db" \
  --out=/path/to/backup
```

### Convert BSON to JSON
```bash
bsondump collection.bson > collection.json
```

### Required JSON Format for Admin UI
```json
{
  "database": "db_name",
  "exportedAt": "ISO_DATE",
  "collections": {
    "collection1": [/* array of documents */],
    "collection2": [/* array of documents */]
  }
}
```

## Troubleshooting

### Large Databases
- For very large databases (>500MB), consider exporting collections separately
- The admin UI has a 500MB file size limit
- Use `mongodump` for large databases, then convert selectively

### ObjectId Format
- The admin UI handles both string and ObjectId formats
- Exported JSON may have `{"$oid": "..."}` format which is automatically converted

### Authentication Issues
- Ensure you have proper credentials for the old server
- Check if old server uses TLS (add `?tls=true` to URI)
- Verify authSource if using different authentication database

### Network Issues
- If old server is remote, ensure network access
- Consider using SSH tunnel for secure connections
- Use VPN if required

## Example: Complete Export Workflow

```bash
# 1. Export from old server
mongodump --uri="mongodb://user:pass@old-server:27017/mydb" --out=./backup

# 2. Convert to JSON format (using Node.js script or manual)
node export-database.js  # or use mongoexport method

# 3. Import via Admin UI
# - Go to http://localhost:3000
# - Create database "mydb" (if needed)
# - Click Import
# - Select the JSON file
# - Import!
```
