const endpoint = {
  http: {
    devnet: 'http://api.devnet.mundis.io',
    testnet: 'http://api.testnet.mundis.io',
    mainnet: 'http://api.mainnet.mundis.io/',
  },
  https: {
    devnet: 'https://api.devnet.mundis.io',
    testnet: 'https://api.testnet.mundis.io',
    mainnet: 'https://api.mainnet.mundis.io/',
  },
};

export type Cluster = 'devnet' | 'testnet' | 'mainnet';

/**
 * Retrieves the RPC API URL for the specified cluster
 */
export function clusterApiUrl(cluster?: Cluster, tls?: boolean): string {
  const key = tls === false ? 'http' : 'https';

  if (!cluster) {
    return endpoint[key]['devnet'];
  }

  const url = endpoint[key][cluster];
  if (!url) {
    throw new Error(`Unknown ${key} cluster: ${cluster}`);
  }
  return url;
}
