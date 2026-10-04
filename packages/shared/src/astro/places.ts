/**
 * A small quick-fill list so a birthplace can supply coordinates without any
 * network lookup. `utcOffset` is the STANDARD offset — people born during
 * daylight saving need to adjust it by an hour, which the form says plainly.
 */
export interface Place {
  name: string;
  latitude: number;
  longitude: number;
  utcOffset: number;
}

export const PLACES: readonly Place[] = [
  { name: 'New York, USA', latitude: 40.71, longitude: -74.01, utcOffset: -5 },
  { name: 'Los Angeles, USA', latitude: 34.05, longitude: -118.24, utcOffset: -8 },
  { name: 'Chicago, USA', latitude: 41.88, longitude: -87.63, utcOffset: -6 },
  { name: 'Houston, USA', latitude: 29.76, longitude: -95.37, utcOffset: -6 },
  { name: 'Denver, USA', latitude: 39.74, longitude: -104.99, utcOffset: -7 },
  { name: 'Seattle, USA', latitude: 47.61, longitude: -122.33, utcOffset: -8 },
  { name: 'Toronto, Canada', latitude: 43.65, longitude: -79.38, utcOffset: -5 },
  { name: 'Vancouver, Canada', latitude: 49.28, longitude: -123.12, utcOffset: -8 },
  { name: 'Mexico City, Mexico', latitude: 19.43, longitude: -99.13, utcOffset: -6 },
  { name: 'São Paulo, Brazil', latitude: -23.55, longitude: -46.63, utcOffset: -3 },
  { name: 'Buenos Aires, Argentina', latitude: -34.6, longitude: -58.38, utcOffset: -3 },
  { name: 'London, UK', latitude: 51.51, longitude: -0.13, utcOffset: 0 },
  { name: 'Dublin, Ireland', latitude: 53.35, longitude: -6.26, utcOffset: 0 },
  { name: 'Paris, France', latitude: 48.86, longitude: 2.35, utcOffset: 1 },
  { name: 'Berlin, Germany', latitude: 52.52, longitude: 13.4, utcOffset: 1 },
  { name: 'Madrid, Spain', latitude: 40.42, longitude: -3.7, utcOffset: 1 },
  { name: 'Rome, Italy', latitude: 41.9, longitude: 12.5, utcOffset: 1 },
  { name: 'Stockholm, Sweden', latitude: 59.33, longitude: 18.07, utcOffset: 1 },
  { name: 'Athens, Greece', latitude: 37.98, longitude: 23.73, utcOffset: 2 },
  { name: 'Cairo, Egypt', latitude: 30.04, longitude: 31.24, utcOffset: 2 },
  { name: 'Lagos, Nigeria', latitude: 6.52, longitude: 3.38, utcOffset: 1 },
  { name: 'Johannesburg, South Africa', latitude: -26.2, longitude: 28.05, utcOffset: 2 },
  { name: 'Moscow, Russia', latitude: 55.76, longitude: 37.62, utcOffset: 3 },
  { name: 'Istanbul, Turkey', latitude: 41.01, longitude: 28.98, utcOffset: 3 },
  { name: 'Dubai, UAE', latitude: 25.2, longitude: 55.27, utcOffset: 4 },
  { name: 'Mumbai, India', latitude: 19.08, longitude: 72.88, utcOffset: 5.5 },
  { name: 'Delhi, India', latitude: 28.61, longitude: 77.21, utcOffset: 5.5 },
  { name: 'Bangkok, Thailand', latitude: 13.76, longitude: 100.5, utcOffset: 7 },
  { name: 'Singapore', latitude: 1.35, longitude: 103.82, utcOffset: 8 },
  { name: 'Beijing, China', latitude: 39.9, longitude: 116.41, utcOffset: 8 },
  { name: 'Manila, Philippines', latitude: 14.6, longitude: 120.98, utcOffset: 8 },
  { name: 'Tokyo, Japan', latitude: 35.68, longitude: 139.69, utcOffset: 9 },
  { name: 'Seoul, South Korea', latitude: 37.57, longitude: 126.98, utcOffset: 9 },
  { name: 'Sydney, Australia', latitude: -33.87, longitude: 151.21, utcOffset: 10 },
  { name: 'Auckland, New Zealand', latitude: -36.85, longitude: 174.76, utcOffset: 12 },
];
