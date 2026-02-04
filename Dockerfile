# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Make startup scripts executable
RUN chmod +x start.py start.sh

# Expose port (Railway will set PORT env var)
EXPOSE 8000

# Start command using Python script (more reliable than bash)
CMD ["python", "start.py"]
