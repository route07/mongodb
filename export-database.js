#!/usr/bin/env node
/**
 * Export MongoDB database to Admin UI JSON format
 * 
 * Usage:
 *   node export-database.js mongodb://user:pass@host:27017/dbname
 *   node export-database.js mongodb://user:pass@host:27017/dbname output.json
 * 
 * With TLS:
 *   node export-database.js "mongodb://user:pass@host:27017/dbname?tls=true&tlsCAFile=./tls-certs/ca.crt&tlsAllowInvalidCertificates=true&authSource=admin"
 * 
 * Requirements:
 *   npm install  (to install mongodb dependency)
 */

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

async function exportDatabase(mongoUri, outputFile) {
  let client;
  
  try {
    console.log('Connecting to MongoDB...');
    
    // Parse URI and extract options
    const url = new URL(mongoUri.replace('mongodb://', 'http://'));
    const options = {
      authSource: url.searchParams.get('authSource') || 'admin'
    };
    
    // Handle TLS if specified in URI
    if (url.searchParams.get('tls') === 'true' || url.searchParams.get('ssl') === 'true') {
      options.tls = true;
      if (url.searchParams.get('tlsAllowInvalidCertificates') === 'true' || 
          url.searchParams.get('sslAllowInvalidCertificates') === 'true') {
        options.tlsAllowInvalidCertificates = true;
      }
      const caFile = url.searchParams.get('tlsCAFile') || url.searchParams.get('sslCAFile');
      if (caFile && fs.existsSync(caFile)) {
        options.ca = [fs.readFileSync(caFile, 'utf8')];
        console.log(`Using CA certificate: ${caFile}`);
      }
    }
    
    // Extract database name from URI
    // Format: mongodb://user:pass@host:port/dbname?params
    const uriMatch = mongoUri.match(/mongodb:\/\/[^\/]+\/([^?]+)/);
    if (!uriMatch || !uriMatch[1]) {
      throw new Error('Database name not found in connection string. Format: mongodb://user:pass@host:port/dbname');
    }
    
    const dbName = uriMatch[1].trim();
    console.log(`Using database: ${dbName}`);
    
    // Build connection string - keep original but ensure authSource
    let connectionUri = mongoUri;
    if (!connectionUri.includes('authSource')) {
      connectionUri += (connectionUri.includes('?') ? '&' : '?') + `authSource=${options.authSource}`;
    }
    
    client = new MongoClient(connectionUri, options);
    await client.connect();
    console.log('✓ Connected successfully');
    
    const db = client.db(dbName);
    
    console.log(`Exporting database: ${dbName}`);
    
    const exportData = {
      database: dbName,
      exportedAt: new Date().toISOString(),
      collections: {}
    };
    
    // Get all collections
    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collections`);
    
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      console.log(`  Exporting collection: ${collectionName}...`);
      
      const collection = db.collection(collectionName);
      const documents = await collection.find({}).toArray();
      
      exportData.collections[collectionName] = documents;
      console.log(`    Exported ${documents.length} documents`);
    }
    
    // Determine output filename
    const filename = outputFile || `${dbName}_export_${Date.now()}.json`;
    
    // Write to file
    fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
    
    console.log(`\n✓ Export completed: ${filename}`);
    console.log(`  Total collections: ${collections.length}`);
    
    const totalDocs = Object.values(exportData.collections).reduce((sum, docs) => sum + docs.length, 0);
    console.log(`  Total documents: ${totalDocs}`);
    console.log(`  File size: ${(fs.statSync(filename).size / 1024 / 1024).toFixed(2)} MB`);
    
  } catch (error) {
    console.error('Export failed:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: node export-database.js <mongodb_uri> [output_file]');
  console.log('');
  console.log('Examples:');
  console.log('  node export-database.js mongodb://user:pass@localhost:27017/mydb');
  console.log('  node export-database.js mongodb://user:pass@localhost:27017/mydb mydb.json');
  console.log('');
  console.log('With TLS:');
  console.log('  node export-database.js "mongodb://user:pass@host:27017/db?tls=true"');
  process.exit(1);
}

const mongoUri = args[0];
const outputFile = args[1];

exportDatabase(mongoUri, outputFile).catch(console.error);
