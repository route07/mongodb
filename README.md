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

## Notes

- TLS certificates are stored in `tls-certs/` directory
- Database data is persisted in `db_data/` directory
- All configuration values are managed via `.env` file
- Mongo Admin UI requires initial build with `--build` flag
