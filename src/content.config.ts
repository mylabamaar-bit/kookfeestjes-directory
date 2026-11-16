// Dataschema van de directory. Elke aanbieder is één JSON-bestand in src/data/aanbieders/.
// Regel: geen verzonnen data. Elke aanbieder heeft minstens één bron (URL) met controledatum.
import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'gebruik JJJJ-MM-DD');

const bron = z.object({
  url: z.string().url(),
  soort: z.enum(['website', 'google-maps', 'outscraper', 'zoekresultaat', 'handmatig']),
  gecontroleerd: datum,
});

const aanbieders = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/data/aanbieders' }),
  schema: z.object({
    naam: z.string().min(2),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    stad: z.string(), // slug uit steden.json
    adres: z.string().optional(),
    postcode: z.string().optional(),
    website: z.string().url().optional(),
    telefoon: z.string().optional(),
    googleMapsUrl: z.string().url().optional(),
    googlePlaceId: z.string().optional(),
    beoordeling: z.number().min(0).max(5).optional(),
    aantalReviews: z.number().int().nonnegative().optional(),
    kinderaanbod: z.enum(['ja', 'twijfel', 'nee']),
    type: z.enum(['kookfeestje', 'workshop', 'beide']).optional(),
    leeftijdVan: z.number().int().min(2).max(18).optional(),
    leeftijdTot: z.number().int().min(2).max(18).optional(),
    // Alleen invullen als de prijs letterlijk op de website staat.
    prijsPerKindVan: z.number().positive().optional(),
    prijsPerKindTot: z.number().positive().optional(),
    beschrijving: z.string().max(600).optional(),
    bronnen: z.array(bron).min(1),
    laatstGecontroleerd: datum,
    uitgelicht: z.boolean().default(false),
    handmatigeCheck: z.boolean().default(false), // twijfelgeval: Mo/Claude moet kijken
  }),
});

const steden = defineCollection({
  loader: file('./src/data/steden.json'),
  // id = slug van de stad (bijv. "den-haag")
  schema: z.object({
    naam: z.string(),
    provincie: z.string(),
  }),
});

export const collections = { aanbieders, steden };
