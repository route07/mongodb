// Global state
let currentDb = null;
let currentCollection = null;
let currentPage = 0;
const pageSize = 20;

// API base URL
const API_BASE = '/api';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkConnection();
    loadDatabases();
    setInterval(checkConnection, 5000); // Check connection every 5 seconds
});

// Check MongoDB connection
async function checkConnection() {
    try {
        const response = await fetch(`${API_BASE}/health`);
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
        const response = await fetch(`${API_BASE}/databases`);
        const databases = await response.json();
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
        const response = await fetch(`${API_BASE}/databases/${dbName}/collections`);
        const collections = await response.json();
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
            item.onclick = () => loadDocuments(dbName, collection.name);
            item.innerHTML = `
                <div class="item-name">📄 ${collection.name}</div>
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
            `${API_BASE}/databases/${dbName}/collections/${collectionName}/documents?limit=${pageSize}&skip=${page * pageSize}`
        );
        const data = await response.json();
        
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
            `${API_BASE}/databases/${currentDb}/collections/${currentCollection}/documents/${docId}`
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
            { method: 'DELETE' }
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
        const response = await fetch(`${API_BASE}/databases/${dbName}/export`);
        
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
            method: 'DELETE'
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
