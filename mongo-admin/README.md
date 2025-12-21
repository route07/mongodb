# MongoDB Admin UI

A custom web-based MongoDB administration interface with full TLS support.

## Features

- ✅ Full TLS/SSL support for MongoDB connections
- ✅ Browse databases and collections
- ✅ View, create, edit, and delete documents
- ✅ Modern, responsive UI
- ✅ Real-time connection status
- ✅ Pagination support
- ✅ JSON document editing

## Configuration

The admin UI connects to MongoDB using environment variables:

- `MONGO_USERNAME`: MongoDB username
- `MONGO_PASSWORD`: MongoDB password
- `MONGO_HOST`: MongoDB hostname (default: mongodb)
- `MONGO_PORT`: MongoDB port (default: 27017)
- `MONGO_TLS`: Enable TLS (true/false)
- `MONGO_TLS_ALLOW_INVALID`: Allow self-signed certificates (true/false)
- `MONGO_TLS_CA_FILE`: Path to CA certificate file
- `ADMIN_UI_PORT`: Port for the admin UI server (default: 3000)

## Usage

Access the admin UI at `http://localhost:3000` (or the port specified in `ADMIN_UI_PORT`).

## Development

To run locally (without Docker):

```bash
cd mongo-admin
npm install
npm start
```

The server will start on port 3000 by default.
