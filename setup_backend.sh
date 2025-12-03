#!/bin/bash

# Navigate to the backend directory
cd be || exit

# Create and activate a virtual environment
if [ ! -d "venv" ]; then
  python -m venv venv
fi
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Deactivate virtual environment when done
deactivate
