#!/bin/bash

# Move to the workspace root directory
cd /workspace

# Create .env from template if it doesn't exist
if [ ! -f .env ]; then
  echo "Setting up environment configuration (.env)..."
  cp production.env.example .env
  
  # Inject Gemini API Key if provided as a Codespaces secret
  if [ ! -z "$GEMINI_API_KEY" ]; then
    echo "Injecting Gemini API Key from secrets..."
    sed -i "s/GEMINI_API_KEY=/GEMINI_API_KEY=$GEMINI_API_KEY/g" .env
  fi
  
  # Inject Auth Secret or generate one
  if [ ! -z "$AUTH_SECRET" ]; then
    echo "Injecting AUTH_SECRET from secrets..."
    sed -i "s/AUTH_SECRET=/AUTH_SECRET=$AUTH_SECRET/g" .env
  else
    GEN_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    echo "Generating secure AUTH_SECRET..."
    sed -i "s/AUTH_SECRET=/AUTH_SECRET=$GEN_SECRET/g" .env
  fi
fi

echo "Codespace Environment Setup Complete!"
