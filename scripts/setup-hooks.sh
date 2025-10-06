#!/bin/bash

# Setup git hooks for the project
# This configures git to use the .githooks directory

echo "🔧 Setting up git hooks..."

# Get the root directory of the git repository
GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)

if [ -z "$GIT_ROOT" ]; then
    echo "❌ Not a git repository"
    exit 1
fi

cd "$GIT_ROOT" || exit 1

# Configure git to use .githooks directory
git config core.hooksPath .githooks

echo "✅ Git hooks configured!"
echo "   Hooks directory: .githooks/"
echo ""
echo "Installed hooks:"
ls -la .githooks/

echo ""
echo "📝 The pre-push hook will automatically optimize images before pushing"
