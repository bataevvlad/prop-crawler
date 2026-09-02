export type Source = 'olx' | 'otodom';

export interface Offer {
  id: string;
  source: Source;
  title: string;
  price: string;
  location: string;
  date: string;
  url: string;
  image: string;
}
