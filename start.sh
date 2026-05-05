#!/bin/bash
# CloudDrop — Start Script
# Run: bash start.sh

echo ""
echo "☁️  CloudDrop — Distributed File Storage"
echo "   Group 16: Muhammad Hassaan Adil, Syed Muhammad Monis"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker Desktop."
    exit 1
fi

echo "🚀 Starting all services..."
docker-compose up --build -d

echo ""
echo "⏳ Waiting for HDFS to initialize (30 seconds)..."
sleep 30

echo ""
echo "✅ Services started!"
echo ""
echo "  📱 Web App    → http://localhost:3000"
echo "  📖 API Docs   → http://localhost:8000/docs"
echo "  🗄️  HDFS UI    → http://localhost:9870"
echo ""
echo "📋 To run the demo test:"
echo "   python demo_test.py"
echo ""
echo "🛑 To stop everything:"
echo "   docker-compose down"
echo ""
