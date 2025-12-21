const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { ethers } = require('ethers');
const session = require('express-session');
require('dotenv').config();

const app = express();
const PORT = process.env.ADMIN_UI_PORT || 3000;

// Web3 Auth Configuration
const WEB3_AUTH_ENABLED = process.env.WEB3_AUTH_ENABLED === 'true';
const ADMIN_WALLETS = (process.env.ADMIN_WALLETS || '')
  .split(',')
  .map(addr => addr.trim().toLowerCase())
  .filter(addr => addr.length > 0);

// Configure multer for file uploads
const upload = multer({ 
  dest: '/tmp/uploads/',
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// Ensure upload directory exists
if (!fs.existsSync('/tmp/uploads')) {
  fs.mkdirSync('/tmp/uploads', { recursive: true });
}

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'mongo-admin-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Web3 Authentication Middleware
function requireAuth(req, res, next) {
  if (!WEB3_AUTH_ENABLED) {
    return next();
  }
  
  if (!req.session || !req.session.authenticated || !req.session.walletAddress) {
    return res.status(401).json({ error: 'Authentication required', requiresAuth: true });
  }
  
  // Verify wallet is still in admin list
  const walletAddress = req.session.walletAddress.toLowerCase();
  if (!ADMIN_WALLETS.includes(walletAddress)) {
    req.session.destroy();
    return res.status(403).json({ error: 'Access denied', requiresAuth: true });
  }
  
  next();
}

// MongoDB connection with TLS
let mongoClient = null;

async function connectToMongoDB() {
  try {
    // Build connection URL
    const username = encodeURIComponent(process.env.MONGO_USERNAME || '');
    const password = encodeURIComponent(process.env.MONGO_PASSWORD || '');
    const host = process.env.MONGO_HOST || 'mongodb';
    const port = process.env.MONGO_PORT || '27017';
    
    let mongoUrl = process.env.MONGO_URL || `mongodb://${username}:${password}@${host}:${port}/?authSource=admin`;
    
    const options = {
      authSource: 'admin',
    };

    // TLS configuration
    if (process.env.MONGO_TLS === 'true') {
      options.tls = true;
      options.tlsAllowInvalidCertificates = process.env.MONGO_TLS_ALLOW_INVALID === 'true';
      
      // Add TLS to connection string as well
      if (!mongoUrl.includes('tls=')) {
        mongoUrl += (mongoUrl.includes('?') ? '&' : '?') + 'tls=true';
        if (process.env.MONGO_TLS_ALLOW_INVALID === 'true') {
          mongoUrl += '&tlsAllowInvalidCertificates=true';
        }
      }
      
      // If CA file is provided, read it and add to options
      if (process.env.MONGO_TLS_CA_FILE) {
        try {
          if (fs.existsSync(process.env.MONGO_TLS_CA_FILE)) {
            const caCert = fs.readFileSync(process.env.MONGO_TLS_CA_FILE, 'utf8');
            // Use tlsCAFile for file path (preferred) or ca array
            options.tlsCAFile = process.env.MONGO_TLS_CA_FILE;
            // Also set ca array as fallback
            options.ca = [caCert];
            console.log('Loaded CA certificate from:', process.env.MONGO_TLS_CA_FILE);
          } else {
            console.warn('CA file not found:', process.env.MONGO_TLS_CA_FILE);
          }
        } catch (err) {
          console.warn('Error reading CA file:', err.message);
        }
      }
      
      // If client certificate is provided, use it
      if (process.env.MONGO_TLS_CLIENT_CERT_FILE) {
        try {
          if (fs.existsSync(process.env.MONGO_TLS_CLIENT_CERT_FILE)) {
            const clientCert = fs.readFileSync(process.env.MONGO_TLS_CLIENT_CERT_FILE, 'utf8');
            options.tlsCertificateKeyFile = process.env.MONGO_TLS_CLIENT_CERT_FILE;
            console.log('Loaded client certificate from:', process.env.MONGO_TLS_CLIENT_CERT_FILE);
          }
        } catch (err) {
          console.warn('Error reading client certificate:', err.message);
        }
      }
    }

    console.log('Connecting to MongoDB at:', host + ':' + port);
    console.log('TLS enabled:', process.env.MONGO_TLS === 'true');
    console.log('TLS allow invalid certs:', process.env.MONGO_TLS_ALLOW_INVALID === 'true');
    
    mongoClient = new MongoClient(mongoUrl, options);
    await mongoClient.connect();
    
    // Test connection
    await mongoClient.db('admin').command({ ping: 1 });
    console.log('✓ Connected to MongoDB with TLS');
    return mongoClient;
  } catch (error) {
    console.error('✗ MongoDB connection error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
    throw error;
  }
}

// Initialize connection
connectToMongoDB().catch(console.error);

// Auth endpoints (no auth required)
app.get('/api/auth/status', (req, res) => {
  res.json({
    enabled: WEB3_AUTH_ENABLED,
    authenticated: req.session?.authenticated || false,
    walletAddress: req.session?.walletAddress || null
  });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    if (!WEB3_AUTH_ENABLED) {
      return res.json({ authenticated: true, message: 'Auth disabled' });
    }
    
    const { signature, message, walletAddress } = req.body;
    
    if (!signature || !message || !walletAddress) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Verify wallet address is in admin list
    const address = walletAddress.toLowerCase();
    if (!ADMIN_WALLETS.includes(address)) {
      return res.status(403).json({ error: 'Wallet address not authorized' });
    }
    
    // Verify signature using ethers.js v6
    // personal_sign prefixes the message, so we need to handle that
    try {
      // personal_sign adds "\x19Ethereum Signed Message:\n{length}" prefix
      // ethers.verifyMessage handles this automatically
      const recoveredAddress = ethers.verifyMessage(message, signature).toLowerCase();
      if (recoveredAddress !== address) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } catch (err) {
      console.error('Signature verification error:', err);
      return res.status(401).json({ error: 'Signature verification failed: ' + err.message });
    }
    
    // Set session
    req.session.authenticated = true;
    req.session.walletAddress = address;
    
    res.json({ 
      authenticated: true, 
      walletAddress: address,
      message: 'Login successful' 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// Health check endpoint (no auth required)
app.get('/api/health', async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(503).json({ status: 'disconnected' });
    }
    await mongoClient.db('admin').command({ ping: 1 });
    res.json({ status: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'error', error: error.message });
  }
});

// Get list of databases
app.get('/api/databases', requireAuth, async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(503).json({ error: 'Not connected to MongoDB' });
    }
    const adminDb = mongoClient.db().admin();
    const { databases } = await adminDb.listDatabases();
    res.json(databases);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new database
app.post('/api/databases', requireAuth, async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(503).json({ error: 'Not connected to MongoDB' });
    }
    
    const { dbName } = req.body;
    
    if (!dbName || typeof dbName !== 'string' || dbName.trim().length === 0) {
      return res.status(400).json({ error: 'Database name is required' });
    }
    
    // Validate database name (MongoDB restrictions)
    const validDbName = dbName.trim();
    if (validDbName.length > 64) {
      return res.status(400).json({ error: 'Database name must be 64 characters or less' });
    }
    
    // MongoDB database name restrictions
    if (!/^[a-zA-Z0-9_-]+$/.test(validDbName)) {
      return res.status(400).json({ error: 'Database name can only contain letters, numbers, underscores, and hyphens' });
    }
    
    // Reserved database names
    const reservedNames = ['admin', 'local', 'config'];
    if (reservedNames.includes(validDbName.toLowerCase())) {
      return res.status(400).json({ error: `Database name "${validDbName}" is reserved` });
    }
    
    // Check if database already exists
    const adminDb = mongoClient.db().admin();
    const { databases } = await adminDb.listDatabases();
    const exists = databases.some(db => db.name === validDbName);
    
    if (exists) {
      return res.status(409).json({ error: `Database "${validDbName}" already exists` });
    }
    
    // Create database by inserting a document into a collection
    // MongoDB creates databases lazily when first document is inserted
    const db = mongoClient.db(validDbName);
    const tempCollection = db.collection('_init');
    await tempCollection.insertOne({ _created: new Date(), _init: true });
    await tempCollection.deleteOne({ _init: true }); // Clean up init document
    
    res.json({ 
      message: `Database "${validDbName}" created successfully`,
      database: validDbName
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete database
app.delete('/api/databases/:dbName', requireAuth, async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(503).json({ error: 'Not connected to MongoDB' });
    }
    
    const dbName = req.params.dbName;
    
    // Prevent deletion of system databases
    const reservedNames = ['admin', 'local', 'config'];
    if (reservedNames.includes(dbName.toLowerCase())) {
      return res.status(400).json({ error: `Cannot delete system database "${dbName}"` });
    }
    
    const db = mongoClient.db(dbName);
    await db.dropDatabase();
    
    res.json({ 
      message: `Database "${dbName}" deleted successfully`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get collections for a database
app.get('/api/databases/:dbName/collections', requireAuth, async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(503).json({ error: 'Not connected to MongoDB' });
    }
    const db = mongoClient.db(req.params.dbName);
    const collections = await db.listCollections().toArray();
    res.json(collections);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get documents from a collection
app.get('/api/databases/:dbName/collections/:collectionName/documents', requireAuth, async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(503).json({ error: 'Not connected to MongoDB' });
    }
    const db = mongoClient.db(req.params.dbName);
    const collection = db.collection(req.params.collectionName);
    const limit = parseInt(req.query.limit) || 100;
    const skip = parseInt(req.query.skip) || 0;
    
    const documents = await collection
      .find({})
      .skip(skip)
      .limit(limit)
      .toArray();
    
    const count = await collection.countDocuments();
    
    res.json({
      documents,
      total: count,
      limit,
      skip
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get document by ID
app.get('/api/databases/:dbName/collections/:collectionName/documents/:id', requireAuth, async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(503).json({ error: 'Not connected to MongoDB' });
    }
    const db = mongoClient.db(req.params.dbName);
    const collection = db.collection(req.params.collectionName);
    const { ObjectId } = require('mongodb');
    
    let document;
    try {
      document = await collection.findOne({ _id: new ObjectId(req.params.id) });
    } catch (e) {
      document = await collection.findOne({ _id: req.params.id });
    }
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json(document);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create document
app.post('/api/databases/:dbName/collections/:collectionName/documents', requireAuth, async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(503).json({ error: 'Not connected to MongoDB' });
    }
    const db = mongoClient.db(req.params.dbName);
    const collection = db.collection(req.params.collectionName);
    const result = await collection.insertOne(req.body);
    res.json({ _id: result.insertedId, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update document
app.put('/api/databases/:dbName/collections/:collectionName/documents/:id', requireAuth, async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(503).json({ error: 'Not connected to MongoDB' });
    }
    const db = mongoClient.db(req.params.dbName);
    const collection = db.collection(req.params.collectionName);
    const { ObjectId } = require('mongodb');
    
    const { _id, ...updateData } = req.body;
    let filter;
    try {
      filter = { _id: new ObjectId(req.params.id) };
    } catch (e) {
      filter = { _id: req.params.id };
    }
    
    const result = await collection.updateOne(filter, { $set: updateData });
    res.json({ modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete document
app.delete('/api/databases/:dbName/collections/:collectionName/documents/:id', requireAuth, async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(503).json({ error: 'Not connected to MongoDB' });
    }
    const db = mongoClient.db(req.params.dbName);
    const collection = db.collection(req.params.collectionName);
    const { ObjectId } = require('mongodb');
    
    let filter;
    try {
      filter = { _id: new ObjectId(req.params.id) };
    } catch (e) {
      filter = { _id: req.params.id };
    }
    
    const result = await collection.deleteOne(filter);
    res.json({ deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Run query
app.post('/api/databases/:dbName/collections/:collectionName/query', requireAuth, async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(503).json({ error: 'Not connected to MongoDB' });
    }
    const db = mongoClient.db(req.params.dbName);
    const collection = db.collection(req.params.collectionName);
    const { query, limit = 100, skip = 0 } = req.body;
    
    const parsedQuery = typeof query === 'string' ? JSON.parse(query) : query;
    const documents = await collection
      .find(parsedQuery)
      .skip(skip)
      .limit(limit)
      .toArray();
    
    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get collection stats
app.get('/api/databases/:dbName/collections/:collectionName/stats', requireAuth, async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(503).json({ error: 'Not connected to MongoDB' });
    }
    const db = mongoClient.db(req.params.dbName);
    const stats = await db.command({ collStats: req.params.collectionName });
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export database
app.get('/api/databases/:dbName/export', requireAuth, async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(503).json({ error: 'Not connected to MongoDB' });
    }
    
    const dbName = req.params.dbName;
    const db = mongoClient.db(dbName);
    
    // Get all collections
    const collections = await db.listCollections().toArray();
    const exportData = {
      database: dbName,
      exportedAt: new Date().toISOString(),
      collections: {}
    };
    
    // Export each collection
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      const collection = db.collection(collectionName);
      const documents = await collection.find({}).toArray();
      exportData.collections[collectionName] = documents;
    }
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${dbName}_export_${Date.now()}.json"`);
    res.json(exportData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import database
app.post('/api/databases/:dbName/import', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(503).json({ error: 'Not connected to MongoDB' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const dbName = req.params.dbName;
    const db = mongoClient.db(dbName);
    const filePath = req.file.path;
    
    // Read and parse JSON file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const importData = JSON.parse(fileContent);
    
    if (!importData.collections || typeof importData.collections !== 'object') {
      fs.unlinkSync(filePath); // Clean up
      return res.status(400).json({ error: 'Invalid import file format' });
    }
    
    const results = {
      database: dbName,
      importedAt: new Date().toISOString(),
      collections: {}
    };
    
    // Import each collection
    for (const [collectionName, documents] of Object.entries(importData.collections)) {
      if (!Array.isArray(documents)) {
        continue;
      }
      
      const collection = db.collection(collectionName);
      
      // Option: drop existing collection or merge
      const dropExisting = req.body.dropExisting === 'true';
      if (dropExisting) {
        await collection.drop().catch(() => {}); // Ignore if doesn't exist
      }
      
      if (documents.length > 0) {
        // Preserve _id from import file, or let MongoDB generate new ones
        // Convert string _id to ObjectId if needed
        const { ObjectId } = require('mongodb');
        const documentsToInsert = documents.map(doc => {
          if (doc._id) {
            // Try to convert string _id to ObjectId if it's a valid ObjectId string
            if (typeof doc._id === 'string' && ObjectId.isValid(doc._id) && doc._id.length === 24) {
              try {
                doc._id = new ObjectId(doc._id);
              } catch (e) {
                // Keep as string if conversion fails
              }
            } else if (doc._id && typeof doc._id === 'object' && doc._id.$oid) {
              // Handle MongoDB extended JSON format
              doc._id = new ObjectId(doc._id.$oid);
            }
          }
          return doc;
        });
        
        const insertResult = await collection.insertMany(documentsToInsert, { ordered: false });
        results.collections[collectionName] = {
          inserted: insertResult.insertedCount,
          total: documents.length,
          errors: documents.length - insertResult.insertedCount
        };
      } else {
        results.collections[collectionName] = {
          inserted: 0,
          total: 0,
          errors: 0
        };
      }
    }
    
    // Clean up uploaded file
    fs.unlinkSync(filePath);
    
    res.json(results);
  } catch (error) {
    // Clean up on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MongoDB Admin UI server running on port ${PORT}`);
});
