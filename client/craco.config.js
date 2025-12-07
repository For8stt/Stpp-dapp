const path = require('path');

module.exports = {
  webpack: {
    configure: (config) => {
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        '@react-native-async-storage/async-storage': path.resolve(
          __dirname,
          'src/shims/asyncStorage.js'
        ),
        // Fix for MetaMask SDK openapi-fetch import issue
        // Use CommonJS version instead of ESM
        "openapi-fetch": path.resolve(
          __dirname,
          "node_modules",
          "openapi-fetch",
          "dist",
          "index.js"
        ),
      };

      // Add fallback for openapi-fetch
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
      };

      return config;
    },
  },
};
