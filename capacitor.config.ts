import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bareunity.app',
  appName: 'BareUnity',
  server: {
    url: 'https://www.bareunity.com',
    cleartext: false,
  },
};

export default config;