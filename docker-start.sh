#!/bin/bash

echo "🐳 Starting Study Flow API with Docker..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker compose is available
if ! docker compose version &> /dev/null; then
    echo "❌ docker compose is not available. Please install Docker Compose and try again."
    exit 1
fi

# Create .env.docker if it doesn't exist
if [ ! -f .env.docker ]; then
    echo "📝 Creating .env.docker file from template..."
    cp .env.docker.example .env.docker
    echo "⚠️  Please edit .env.docker file with your actual values before running docker-compose up"
    echo "   Required: JWT_SECRET, JWT_REFRESH_SECRET, OPENAI_API_KEY, AWS credentials"
    exit 1
fi

# Create uploads directory
mkdir -p uploads

echo "🏗️  Building and starting containers..."

# Development mode (only databases)
if [ "$1" = "dev" ]; then
    echo "🔧 Starting development databases only..."
    docker compose -f docker-compose.dev.yml up -d
    echo ""
    echo "✅ Development databases started!"
    echo "🐘 PostgreSQL: localhost:5432"
    echo "🔍 Qdrant: localhost:6333"
    echo ""
    echo "To connect your local API to these databases, use:"
    echo "DATABASE_URL=postgresql://study_flow_user:study_flow_password@localhost:5432/study_flow_db"
    echo "QDRANT_URL=http://localhost:6333"
    exit 0
fi

# Production mode (full stack)
echo "🚀 Starting full production stack..."
docker compose --env-file .env.docker up -d

echo ""
echo "🎉 Containers started successfully!"
echo ""
echo "📊 Container Status:"
docker compose ps

echo ""
echo "🌐 Services:"
echo "📱 API: http://localhost:3000"
echo "🏥 Health Check: http://localhost:3000/health"
echo "🐘 PostgreSQL: localhost:5432"
echo "🔍 Qdrant: localhost:6333"
echo ""
echo "📋 Useful commands:"
echo "  docker compose logs api          # View API logs"
echo "  docker compose logs postgres     # View database logs"
echo "  docker compose logs qdrant       # View Qdrant logs"
echo "  docker compose exec api sh       # Access API container"
echo "  docker compose exec postgres psql -U study_flow_user -d study_flow_db  # Access database"
echo "  docker compose down              # Stop all containers"
echo "  docker compose down -v           # Stop and remove volumes (⚠️  deletes data)"
