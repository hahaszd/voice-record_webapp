#!/usr/bin/env python3
"""
Railway startup script for VoiceSpark
Handles PORT environment variable correctly and provides startup diagnostics
"""
import os
import sys
import subprocess

def main():
    # Get PORT from environment, ensure it's an integer
    port = os.environ.get('PORT', '8000')
    
    # Validate port is numeric
    try:
        port_int = int(port)
        if not (1 <= port_int <= 65535):
            print(f"⚠️  Invalid port {port_int}, using 8000")
            port_int = 8000
    except ValueError:
        print(f"⚠️  PORT '{port}' is not a valid number, using 8000")
        port_int = 8000
    
    # Print startup info
    print(f"🚀 Starting VoiceSpark on port {port_int}")
    print(f"📝 Environment: {os.environ.get('DEPLOY_ENVIRONMENT', 'unknown')}")
    print(f"🐍 Python version: {sys.version.split()[0]}")
    
    # Check credentials
    if os.environ.get('GOOGLE_APPLICATION_CREDENTIALS_JSON'):
        print("✅ Google Cloud credentials found in environment")
    else:
        print("⚠️  Warning: GOOGLE_APPLICATION_CREDENTIALS_JSON not set")
    
    # Start uvicorn
    cmd = [
        "uvicorn",
        "server2:app",
        "--host", "0.0.0.0",
        "--port", str(port_int),
        "--log-level", "info",
        "--access-log",
    ]
    
    print(f"🔧 Running: {' '.join(cmd)}")
    print("-" * 50)
    
    # Execute uvicorn (replace current process)
    os.execvp(cmd[0], cmd)

if __name__ == "__main__":
    main()
