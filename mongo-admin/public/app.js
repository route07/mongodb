// Global state
let currentDb = null;
let currentCollection = null;
let currentPage = 0;
const pageSize = 20;

// API base URL
const API_BASE = '/api';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuthStatus();
    checkConnection();
    setInterval(checkConnection, 5000); // Check connection every 5 seconds
});

// Check authentication status
async function checkAuthStatus() {
    try {
        const response = await fetch(`${API_BASE}/auth/status`, { credentials: 'include' });
        const data = await response.json();
        
        if (data.enabled && !data.authenticated) {
            showLoginModal();
            // Don't load databases if not authenticated
            return;
        } else if (data.authenticated) {
            updateAuthUI(data.walletAddress);
            loadDatabases();
        } else {
            // Auth disabled
            loadDatabases();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        // If auth check fails, try to load databases anyway
        // (might be auth disabled or network issue)
        loadDatabases();
    }
}

// Update auth UI
function updateAuthUI(walletAddress) {
    const authStatusEl = document.getElementById('authStatus');
    const walletAddressEl = document.getElementById('walletAddress');
    if (walletAddress) {
        const shortAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
        walletAddressEl.textContent = `🦊 ${shortAddress}`;
        authStatusEl.style.display = 'block';
    }
}

// Show login modal
function showLoginModal() {
    document.getElementById('loginModal').style.display = 'block';
}

// Close login modal
function closeLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
}

// Connect wallet and login
async function connectWallet() {
    const statusEl = document.getElementById('loginStatus');
    statusEl.style.display = 'block';
    statusEl.innerHTML = '<div style="color: #3498db;">Connecting wallet...</div>';
    
    try {
        // Check if Web3 is available
        if (typeof window.ethereum === 'undefined') {
            throw new Error('Please install MetaMask or another Web3 wallet');
        }
        
        // Request account access
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts.length === 0) {
            throw new Error('No accounts found. Please unlock your wallet.');
        }
        
        const walletAddress = accounts[0];
        statusEl.innerHTML = '<div style="color: #3498db;">Please sign the message in your wallet...</div>';
        
        // Create message to sign
        const message = `Sign in to MongoDB Admin UI\n\nWallet: ${walletAddress}\nTimestamp: ${Date.now()}`;
        
        // Sign message using personal_sign (no ethers.js needed on frontend)
        // The backend will verify using ethers.js
        const signature = await window.ethereum.request({
            method: 'personal_sign',
            params: [message, walletAddress]
        });
        
        statusEl.innerHTML = '<div style="color: #3498db;">Verifying signature...</div>';
        
        // Send to backend
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                signature,
                message,
                walletAddress
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Login failed');
        }
        
        statusEl.innerHTML = '<div style="background: #d4edda; color: #155724; padding: 1rem; border-radius: 4px;">✓ Login successful!</div>';
        
        // Update UI and reload
        setTimeout(() => {
            closeLoginModal();
            updateAuthUI(result.walletAddress);
            loadDatabases();
        }, 1000);
        
    } catch (error) {
        statusEl.innerHTML = `<div class="error">${error.message}</div>`;
    }
}

// Logout
async function logout() {
    try {
        const response = await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            document.getElementById('authStatus').style.display = 'none';
            showLoginModal();
            // Clear UI
            document.getElementById('welcomeView').style.display = 'block';
            document.getElementById('collectionView').style.display = 'none';
            document.getElementById('databaseList').innerHTML = '';
        }
    } catch (error) {
        showError('Logout failed: ' + error.message);
    }
}

// Check MongoDB connection
async function checkConnection() {
    try {
        const response = await fetch(`${API_BASE}/health`, { credentials: 'include' });
        const data = await response.json();
        const statusEl = document.getElementById('connectionStatus');
        const dot = statusEl.querySelector('.status-dot');
        const text = statusEl.querySelector('span:last-child');
        
        if (data.status === 'connected') {
            dot.className = 'status-dot connected';
            text.textContent = 'Connected';
        } else {
            dot.className = 'status-dot disconnected';
            text.textContent = 'Disconnected';
        }
    } catch (error) {
        const statusEl = document.getElementById('connectionStatus');
        const dot = statusEl.querySelector('.status-dot');
        const text = statusEl.querySelector('span:last-child');
        dot.className = 'status-dot disconnected';
        text.textContent = 'Connection Error';
    }
}

// Load databases
async function loadDatabases() {
    try {
        const response = await fetch(`${API_BASE}/databases`, { credentials: 'include' });
        
        if (response.status === 401 || response.status === 403) {
            const data = await response.json().catch(() => ({ requiresAuth: true }));
            if (data.requiresAuth || response.status === 401) {
                showLoginModal();
                return;
            }
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to load databases' }));
            throw new Error(errorData.error || 'Failed to load databases');
        }
        
        const databases = await response.json();
        
        // Ensure databases is an array
        if (!Array.isArray(databases)) {
            console.error('Invalid response format:', databases);
            throw new Error('Invalid response from server');
        }
        
        const listEl = document.getElementById('databaseList');
        listEl.innerHTML = '';
        
        databases.forEach(db => {
            const item = document.createElement('li');
            item.className = 'list-item';
            const isSystemDb = ['admin', 'local', 'config'].includes(db.name.toLowerCase());
            item.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <div style="flex: 1; cursor: pointer;" onclick="loadCollections('${db.name}')">
                        <div class="item-name">${db.name} ${isSystemDb ? '<span style="color: #7f8c8d; font-size: 0.8em;">(system)</span>' : ''}</div>
                        <div class="item-meta">${formatBytes(db.sizeOnDisk || 0)}</div>
                    </div>
                    <div class="db-actions" style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" 
                                onclick="event.stopPropagation(); exportDatabase('${db.name}')" 
                                title="Export database">
                            📥 Export
                        </button>
                        <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" 
                                onclick="event.stopPropagation(); showImportModal('${db.name}')" 
                                title="Import database">
                            📤 Import
                        </button>
                        ${!isSystemDb ? `<button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" 
                                onclick="event.stopPropagation(); deleteDatabase('${db.name}')" 
                                title="Delete database">
                            🗑️
                        </button>` : ''}
                    </div>
                </div>
            `;
            listEl.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading databases:', error);
        showError('Failed to load databases: ' + error.message);
    }
}

// Load collections for a database
async function loadCollections(dbName) {
    try {
        currentDb = dbName;
        const response = await fetch(`${API_BASE}/databases/${dbName}/collections`, { credentials: 'include' });
        
        if (response.status === 401 || response.status === 403) {
            const data = await response.json().catch(() => ({ requiresAuth: true }));
            if (data.requiresAuth || response.status === 401) {
                showLoginModal();
                return;
            }
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to load collections' }));
            throw new Error(errorData.error || 'Failed to load collections');
        }
        
        const collections = await response.json();
        
        if (!Array.isArray(collections)) {
            throw new Error('Invalid response format');
        }
        const listEl = document.getElementById('databaseList');
        
        // Update active state
        Array.from(listEl.children).forEach(item => {
            item.classList.remove('active');
            if (item.querySelector('.item-name').textContent === dbName) {
                item.classList.add('active');
            }
        });
        
        // Add collections
        collections.forEach(collection => {
            const item = document.createElement('li');
            item.className = 'list-item';
            item.style.marginLeft = '1rem';
            const isSystemCollection = collection.name.startsWith('system.');
            item.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <div style="flex: 1; cursor: pointer;" onclick="loadDocuments('${dbName}', '${collection.name}')">
                        <div class="item-name">📄 ${collection.name} ${isSystemCollection ? '<span style="color: #7f8c8d; font-size: 0.8em;">(system)</span>' : ''}</div>
                    </div>
                    ${!isSystemCollection ? `
                    <div class="collection-actions" style="display: flex; gap: 0.25rem;">
                        <button class="btn btn-danger" style="padding: 0.2rem 0.4rem; font-size: 0.75rem;" 
                                onclick="event.stopPropagation(); deleteCollection('${dbName}', '${collection.name}')" 
                                title="Delete collection">
                            🗑️
                        </button>
                    </div>
                    ` : ''}
                </div>
            `;
            listEl.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading collections:', error);
        showError('Failed to load collections: ' + error.message);
    }
}

// Load documents from a collection
async function loadDocuments(dbName, collectionName, page = 0) {
    try {
        currentDb = dbName;
        currentCollection = collectionName;
        currentPage = page;
        
        const response = await fetch(
            `${API_BASE}/databases/${dbName}/collections/${collectionName}/documents?limit=${pageSize}&skip=${page * pageSize}`,
            { credentials: 'include' }
        );
        
        if (response.status === 401 || response.status === 403) {
            const data = await response.json().catch(() => ({ requiresAuth: true }));
            if (data.requiresAuth || response.status === 401) {
                showLoginModal();
                return;
            }
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to load documents' }));
            throw new Error(errorData.error || 'Failed to load documents');
        }
        
        const data = await response.json();
        
        if (!data || typeof data !== 'object' || !Array.isArray(data.documents)) {
            throw new Error('Invalid response format');
        }
        
        // Show collection view
        document.getElementById('welcomeView').style.display = 'none';
        document.getElementById('collectionView').style.display = 'block';
        document.getElementById('collectionTitle').textContent = `${dbName}.${collectionName}`;
        
        // Display documents
        const container = document.getElementById('documentsList');
        if (data.documents.length === 0) {
            container.innerHTML = '<div class="empty-state">No documents found</div>';
        } else {
            container.innerHTML = data.documents.map(doc => createDocumentCard(doc)).join('');
        }
        
        // Update pagination
        updatePagination(data.total, page);
    } catch (error) {
        console.error('Error loading documents:', error);
        showError('Failed to load documents: ' + error.message);
    }
}

// Create document card HTML
function createDocumentCard(doc) {
    const docStr = JSON.stringify(doc, null, 2);
    const docId = doc._id.$oid || doc._id;
    return `
        <div class="document-card" onclick="showEditModal('${docId}')">
            <div class="document-id">ID: ${docId}</div>
            <div class="document-content">${escapeHtml(docStr)}</div>
        </div>
    `;
}

// Show edit document modal
async function showEditModal(docId) {
    try {
        const response = await fetch(
            `${API_BASE}/databases/${currentDb}/collections/${currentCollection}/documents/${docId}`,
            { credentials: 'include' }
        );
        const doc = await response.json();
        document.getElementById('editDocumentJson').value = JSON.stringify(doc, null, 2);
        document.getElementById('editDocumentModal').style.display = 'block';
        document.getElementById('editDocumentModal').dataset.docId = docId;
    } catch (error) {
        showError('Failed to load document: ' + error.message);
    }
}

// Close edit modal
function closeEditModal() {
    document.getElementById('editDocumentModal').style.display = 'none';
}

// Show add document modal
function showAddDocumentModal() {
    document.getElementById('documentJson').value = '{}';
    document.getElementById('addDocumentModal').style.display = 'block';
}

// Close modal
function closeModal() {
    document.getElementById('addDocumentModal').style.display = 'none';
}

// Save new document
async function saveDocument() {
    try {
        const jsonText = document.getElementById('documentJson').value;
        const doc = JSON.parse(jsonText);
        
        const response = await fetch(
            `${API_BASE}/databases/${currentDb}/collections/${currentCollection}/documents`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(doc)
            }
        );
        
        if (response.ok) {
            closeModal();
            loadDocuments(currentDb, currentCollection, currentPage);
        } else {
            const error = await response.json();
            showError('Failed to save document: ' + error.error);
        }
    } catch (error) {
        showError('Invalid JSON: ' + error.message);
    }
}

// Update document
async function updateDocument() {
    try {
        const docId = document.getElementById('editDocumentModal').dataset.docId;
        const jsonText = document.getElementById('editDocumentJson').value;
        const doc = JSON.parse(jsonText);
        
        const response = await fetch(
            `${API_BASE}/databases/${currentDb}/collections/${currentCollection}/documents/${docId}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(doc)
            }
        );
        
        if (response.ok) {
            closeEditModal();
            loadDocuments(currentDb, currentCollection, currentPage);
        } else {
            const error = await response.json();
            showError('Failed to update document: ' + error.error);
        }
    } catch (error) {
        showError('Invalid JSON: ' + error.message);
    }
}

// Delete document
async function deleteDocument() {
    if (!confirm('Are you sure you want to delete this document?')) {
        return;
    }
    
    try {
        const docId = document.getElementById('editDocumentModal').dataset.docId;
        const response = await fetch(
            `${API_BASE}/databases/${currentDb}/collections/${currentCollection}/documents/${docId}`,
            { method: 'DELETE', credentials: 'include' }
        );
        
        if (response.ok) {
            closeEditModal();
            loadDocuments(currentDb, currentCollection, currentPage);
        } else {
            const error = await response.json();
            showError('Failed to delete document: ' + error.error);
        }
    } catch (error) {
        showError('Failed to delete document: ' + error.message);
    }
}

// Refresh documents
function refreshDocuments() {
    loadDocuments(currentDb, currentCollection, currentPage);
}

// Delete collection
async function deleteCollection(dbName, collectionName) {
    if (!confirm(`Are you sure you want to delete the collection "${collectionName}"?\n\nThis action cannot be undone and will delete all documents in this collection.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/databases/${dbName}/collections/${collectionName}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to delete collection');
        }
        
        showError(`✓ ${result.message}`);
        
        // Reload collections
        loadCollections(dbName);
        
        // If we were viewing this collection, go back to database view
        if (currentDb === dbName && currentCollection === collectionName) {
            document.getElementById('welcomeView').style.display = 'block';
            document.getElementById('collectionView').style.display = 'none';
            currentCollection = null;
        }
        
    } catch (error) {
        showError(`Delete failed: ${error.message}`);
    }
}

// Update pagination
function updatePagination(total, page) {
    const paginationEl = document.getElementById('pagination');
    const totalPages = Math.ceil(total / pageSize);
    
    paginationEl.innerHTML = `
        <button ${page === 0 ? 'disabled' : ''} onclick="loadDocuments('${currentDb}', '${currentCollection}', ${page - 1})">Previous</button>
        <span>Page ${page + 1} of ${totalPages} (${total} total)</span>
        <button ${page >= totalPages - 1 ? 'disabled' : ''} onclick="loadDocuments('${currentDb}', '${currentCollection}', ${page + 1})">Next</button>
    `;
}

// Utility functions
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    const errorEl = document.createElement('div');
    errorEl.className = 'error';
    errorEl.textContent = message;
    document.querySelector('.content-area').prepend(errorEl);
    setTimeout(() => errorEl.remove(), 5000);
}

// Export database
async function exportDatabase(dbName) {
    try {
        showError(`Exporting database "${dbName}"...`);
        const response = await fetch(`${API_BASE}/databases/${dbName}/export`, { credentials: 'include' });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Export failed');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${dbName}_export_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showError(`✓ Database "${dbName}" exported successfully!`);
    } catch (error) {
        showError(`Export failed: ${error.message}`);
    }
}

// Show import modal
function showImportModal(dbName) {
    document.getElementById('importDatabaseName').textContent = `Database: ${dbName}`;
    document.getElementById('importDatabaseModal').dataset.dbName = dbName;
    document.getElementById('importFile').value = '';
    document.getElementById('dropExisting').checked = false;
    document.getElementById('importStatus').style.display = 'none';
    document.getElementById('importStatus').innerHTML = '';
    document.getElementById('importDatabaseModal').style.display = 'block';
}

// Close import modal
function closeImportModal() {
    document.getElementById('importDatabaseModal').style.display = 'none';
}

// Show create database modal
function showCreateDatabaseModal() {
    document.getElementById('newDatabaseName').value = '';
    document.getElementById('createDatabaseStatus').style.display = 'none';
    document.getElementById('createDatabaseStatus').innerHTML = '';
    document.getElementById('createDatabaseModal').style.display = 'block';
    document.getElementById('newDatabaseName').focus();
}

// Close create database modal
function closeCreateDatabaseModal() {
    document.getElementById('createDatabaseModal').style.display = 'none';
}

// Create database
async function createDatabase() {
    const dbName = document.getElementById('newDatabaseName').value.trim();
    const statusEl = document.getElementById('createDatabaseStatus');
    
    if (!dbName) {
        statusEl.style.display = 'block';
        statusEl.innerHTML = '<div class="error">Please enter a database name</div>';
        return;
    }
    
    statusEl.style.display = 'block';
    statusEl.innerHTML = '<div style="color: #3498db;">Creating database... Please wait.</div>';
    
    try {
        const response = await fetch(`${API_BASE}/databases`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ dbName })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to create database');
        }
        
        statusEl.innerHTML = `<div style="background: #d4edda; color: #155724; padding: 1rem; border-radius: 4px;">
            <strong>✓ ${result.message}</strong>
        </div>`;
        
        // Reload databases and close modal after a delay
        setTimeout(() => {
            loadDatabases();
            closeCreateDatabaseModal();
        }, 1500);
        
    } catch (error) {
        statusEl.innerHTML = `<div class="error">${error.message}</div>`;
    }
}

// Delete database
async function deleteDatabase(dbName) {
    if (!confirm(`Are you sure you want to delete the database "${dbName}"?\n\nThis action cannot be undone and will delete all collections and data in this database.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/databases/${dbName}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to delete database');
        }
        
        showError(`✓ ${result.message}`);
        
        // Reload databases
        loadDatabases();
        
        // If we were viewing this database, go back to welcome view
        if (currentDb === dbName) {
            document.getElementById('welcomeView').style.display = 'block';
            document.getElementById('collectionView').style.display = 'none';
            currentDb = null;
            currentCollection = null;
        }
        
    } catch (error) {
        showError(`Delete failed: ${error.message}`);
    }
}

// Import database
async function importDatabase() {
    const dbName = document.getElementById('importDatabaseModal').dataset.dbName;
    const fileInput = document.getElementById('importFile');
    const dropExisting = document.getElementById('dropExisting').checked;
    const statusEl = document.getElementById('importStatus');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        statusEl.style.display = 'block';
        statusEl.innerHTML = '<div class="error">Please select a file to import</div>';
        return;
    }
    
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('dropExisting', dropExisting.toString());
    
    statusEl.style.display = 'block';
    statusEl.innerHTML = '<div style="color: #3498db;">Importing database... Please wait.</div>';
    
    try {
        const response = await fetch(`${API_BASE}/databases/${dbName}/import`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Import failed');
        }
        
        // Display import results
        let resultsHtml = '<div style="background: #d4edda; color: #155724; padding: 1rem; border-radius: 4px; margin-top: 1rem;">';
        resultsHtml += `<strong>✓ Import completed successfully!</strong><br>`;
        resultsHtml += `<small>Imported at: ${new Date(result.importedAt).toLocaleString()}</small><br><br>`;
        resultsHtml += '<strong>Collections:</strong><ul style="margin: 0.5rem 0; padding-left: 1.5rem;">';
        
        for (const [collectionName, stats] of Object.entries(result.collections)) {
            resultsHtml += `<li>${collectionName}: ${stats.inserted} / ${stats.total} documents</li>`;
        }
        
        resultsHtml += '</ul></div>';
        statusEl.innerHTML = resultsHtml;
        
        // Reload databases after import
        setTimeout(() => {
            loadDatabases();
            if (currentDb === dbName) {
                loadCollections(dbName);
            }
        }, 2000);
        
    } catch (error) {
        statusEl.innerHTML = `<div class="error">Import failed: ${error.message}</div>`;
    }
}
