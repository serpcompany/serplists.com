#!/bin/bash

echo "Setting up Cloudflare D1 Database and Pages..."

# Install wrangler if not installed
if ! command -v wrangler &> /dev/null; then
    echo "Installing Wrangler CLI..."
    npm install -g wrangler
fi

# Login to Cloudflare
echo "Logging in to Cloudflare..."
wrangler login

# Create D1 database
echo "Creating D1 database..."
wrangler d1 create serp-checklists-db

# Get the database ID from the output and update wrangler.toml
echo "Please update the database_id in wrangler.toml with the ID shown above"
read -p "Press enter after updating wrangler.toml..."

# Run migrations
echo "Running database migrations..."
wrangler d1 execute serp-checklists-db --file=./migrations/0001_initial_schema.sql

# Generate JWT secret
JWT_SECRET=$(openssl rand -base64 32)
echo "Generated JWT_SECRET: $JWT_SECRET"
echo "Adding secret to Cloudflare..."
echo "$JWT_SECRET" | wrangler secret put JWT_SECRET

# Deploy to Cloudflare Pages
echo "Deploying to Cloudflare Pages..."
npm run build
wrangler pages deploy dist

echo "Setup complete! Your app should be available at your Cloudflare Pages URL."
echo ""
echo "Next steps:"
echo "1. Update your frontend to use CloudflareAuthContext instead of the Supabase AuthContext"
echo "2. Replace Supabase API calls with the new api client"
echo "3. Test the authentication and checklist features"
echo ""
echo "To run locally:"
echo "  npm run dev (for frontend)"
echo "  wrangler pages dev dist --compatibility-date=2024-08-11 (for API)"