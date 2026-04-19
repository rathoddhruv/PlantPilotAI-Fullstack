#!/bin/bash
# Installation script for NGRX state management

echo "Installing NGRX packages..."
npm install @ngrx/store @ngrx/effects @ngrx/store-devtools --save

echo "Installation complete!"
echo ""
echo "Next steps:"
echo "1. The app.config.ts has been pre-configured with NGRX providers"
echo "2. Store, effects, and selectors are ready to use"
echo "3. Start using store.dispatch() in components"
echo "4. Subscribe to state using store.select(selector)"
echo ""
echo "For Redux DevTools debugging, install the browser extension:"
echo "- Chrome: https://chrome.google.com/webstore/detail/redux-devtools/lmjabbbqnzsacbqjbgbnbahkhmpamopl"
echo "- Firefox: https://addons.mozilla.org/firefox/addon/reduxdevtools/"
