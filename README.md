# MongoDB Docker Setup

A simple Docker Compose setup for MongoDB with TLS encryption and Mongo Express admin UI.

## Prerequisites

- Docker and Docker Compose installed
- OpenSSL (for generating TLS certificates)

## Quick Start

### 1. Generate TLS Certificates

```bash
./generate-tls-certs.sh
```

This creates the required TLS certificates in the `tls-certs/` directory.

### 2. Configure Environment Variables

Edit the `.env` file with your desired credentials:

```bash
# Mongo DB
MONGO_INITDB_ROOT_USERNAME=rbdbuser
MONGO_INITDB_ROOT_PASSWORD=your_password_here
MONGO_PORT=27017

# Mongo Express (legacy)
ME_CONFIG_MONGODB_ADMINUSERNAME=rbdbuser
ME_CONFIG_MONGODB_ADMINPASSWORD=your_password_here
ME_CONFIG_MONGODB_SERVER=mongodb
ME_CONFIG_MONGODB_PORT=27017
ME_CONFIG_BASICAUTH_USERNAME=adminu
ME_CONFIG_BASICAUTH_PASSWORD=adminPassword
MONGO_EXPRESS_PORT=8992

# Custom MongoDB Admin UI (recommended - supports TLS)
ADMIN_UI_PORT=3000
```

### 3. Start Services

For the first time (or after changes to mongo-admin), build and start:

```bash
docker-compose up -d --build
```

For subsequent starts (no code changes):

```bash
docker-compose up -d
```

### 4. Access Services

- **MongoDB**: `localhost:27017` (requires TLS)
- **Custom Admin UI** (with TLS support): `http://localhost:3000`
  - Full TLS support
  - Web3 wallet authentication (optional, see Web3 Auth section)
  - Database export/import
  - Create/delete databases
- **Mongo Express UI** (legacy): `http://localhost:8992`

## Connection String

Connect to MongoDB using TLS:

```bash
mongosh "mongodb://your_username:your_password@localhost:27017/?tls=true&tlsCAFile=./tls-certs/ca.crt"
```

## Services

- **mongodb**: MongoDB 7.0 instance with TLS encryption (requireTLS mode)
- **mongo-admin**: Custom web-based MongoDB admin interface with full TLS support
- **mongo-express**: Legacy MongoDB admin interface (mongo-express)

## Stop Services

```bash
docker-compose down
```

To remove volumes (database data):

```bash
docker-compose down -v
```

## Mongo Admin UI Setup

The custom MongoDB Admin UI (`mongo-admin`) needs to be built on first run:

```bash
# Build and start all services (first time)
docker-compose up -d --build 
(or just docker-compose up -d , it will build if not built. If any changes, use --build)

# Or build only mongo-admin
docker-compose build mongo-admin
docker-compose up -d mongo-admin
```

### Web3 Authentication (Optional)

The admin UI supports Web3 wallet authentication. To enable:

1. Edit `.env` file:
   ```bash
   WEB3_AUTH_ENABLED=true
   ADMIN_WALLETS=0xYourWalletAddress1,0xYourWalletAddress2
   SESSION_SECRET=your-secure-random-secret
   ```

2. Restart the service:
   ```bash
   docker-compose restart mongo-admin
   ```

3. Connect your wallet when accessing the UI

See `mongo-admin/WEB3_AUTH.md` for detailed authentication setup.

## Export/Import Databases

To migrate databases from an old MongoDB server to the new admin UI:

### Quick Method (Using Export Tool)

The export tool is in the `database-export/` directory. **This is optional** - only install if you need to export from other MongoDB servers.

```bash
# Navigate to export tool directory
cd database-export

# Install dependencies (one time, only if you need this tool)
npm install

# Export from old server
# Basic (no TLS)
node export-database.js "mongodb://user:pass@old-server:27017/dbname"

# With TLS (like your new server)
node export-database.js "mongodb://user:pass@old-server:27017/dbname?tls=true&tlsCAFile=../tls-certs/ca.crt&tlsAllowInvalidCertificates=true&authSource=admin"

# This creates: dbname_export_TIMESTAMP.json
# Then import via Admin UI at http://localhost:3000
```

See [database-export/README.md](./database-export/README.md) for complete export tool documentation.

### Manual Methods

1. **Using mongoexport** (per collection):
   ```bash
   mongoexport --uri="mongodb://user:pass@old-server:27017/dbname" \
     --collection=collection_name --out=collection.json --jsonArray
   ```

2. **Using mongodump** (entire database):
   ```bash
   mongodump --uri="mongodb://user:pass@old-server:27017/dbname" --out=./backup
   # Then convert BSON to JSON (see guide below)
   ```

3. **Import via Admin UI**:
   - Go to `http://localhost:3000`
   - Create the database (if needed)
   - Click "Import" on the database
   - Select your JSON file
   - Import!

See [EXPORT_IMPORT_GUIDE.md](./EXPORT_IMPORT_GUIDE.md) for detailed instructions and troubleshooting.

## Notes

- TLS certificates are stored in `tls-certs/` directory
- Database data is persisted in `db_data/` directory
- All configuration values are managed via `.env` file
- Mongo Admin UI requires initial build with `--build` flag
