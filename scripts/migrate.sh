#!/bin/bash

echo "🗃️  Running database migrations..."

# Check if we're in Docker or local environment
if [ -f /.dockerenv ]; then
    echo "📦 Running in Docker container"
    # Wait for database to be ready
    until pg_isready -h postgres -U study_flow_user -d study_flow_db; do
        echo "⏳ Waiting for PostgreSQL to be ready..."
        sleep 2
    done
    
    echo "✅ PostgreSQL is ready!"
    
    # Run migrations
    npx prisma migrate deploy
    
    echo "🎉 Migrations completed!"
else
    echo "💻 Running in local environment"
    
    # Check if Docker databases are running
    if docker-compose -f docker-compose.dev.yml ps postgres | grep -q "Up"; then
        echo "🐳 Using Docker databases"
        export DATABASE_URL="postgresql://study_flow_user:study_flow_password@localhost:5432/study_flow_db"
    fi
    
    # Run migrations
    npm run prisma:migrate
    
    echo "🎉 Local migrations completed!"
fi
