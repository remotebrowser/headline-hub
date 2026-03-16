import { WebServiceClient } from '@maxmind/geoip2-node';
import { settings } from './config.js';
import { Request } from 'express';

type LocationData = {
  ip: string;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
};

const ipCache = new Map<string, LocationData>();

const normalizeIp = (ip: string): string =>
  ip.startsWith('::ffff:') ? ip.slice(7) : ip;

export const getClientIp = (request: Request): string => {
  const xff = request.headers['x-forwarded-for'];
  if (xff && typeof xff === 'string') {
    return normalizeIp(xff.split(',')[0].trim());
  }

  return normalizeIp(request.ip || request.connection.remoteAddress || 'unknown');
};

export const getLocation = async (
  request: Request
): Promise<LocationData | null> => {
  const ipAddress = getClientIp(request);
  console.log(`🔍 Getting client location for IP: ${ipAddress}`);

  if (
    ipAddress === 'unknown' ||
    ipAddress.includes('127.0.0.1') ||
    ipAddress.includes('localhost') ||
    ipAddress === '::1'
  ) {
    console.log('[LocationService] unknown ip address: ', ipAddress);
    return null;
  }

  const cached = ipCache.get(ipAddress);
  if (cached) {
    console.log(
      '[LocationService] cached response for ip address: ',
      ipAddress
    );
    return cached;
  }

  if (!settings.MAXMIND_ACCOUNT_ID || !settings.MAXMIND_LICENSE_KEY) {
    console.warn(
      '[LocationService] MaxMind account ID or license key not configured'
    );
    return null;
  }

  try {
    const client = new WebServiceClient(
      settings.MAXMIND_ACCOUNT_ID,
      settings.MAXMIND_LICENSE_KEY
    );
    const response = await client.city(ipAddress);

    let locationData: LocationData = {
      ip: ipAddress,
      city: null,
      state: null,
      country: null,
      postal_code: null,
    };

    if (response) {
      locationData = {
        ...locationData,
        city: response?.city?.names.en ?? null,
        state:
          response?.subdivisions?.[response.subdivisions.length - 1]?.names
            .en ?? null,
        country: response?.country?.isoCode ?? null,
        postal_code: response?.postal?.code ?? null,
      };

      console.log(
        `🔍 Client Location: city: ${locationData.city}, country: ${locationData.country}, state: ${locationData.state}, postal_code: ${locationData.postal_code}`
      );
    }

    ipCache.set(ipAddress, locationData);
    console.log('[LocationService] set cache for ip address: ', ipAddress);
    return locationData;
  } catch (error) {
    console.error(`Unexpected error geolocating IP ${ipAddress}:`, error);
    return null;
  }
};
