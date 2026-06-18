// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import {
  dedupeJobs,
  discoverAtsTargets,
  extractHtmlJobs,
  fetchDiscoveredTargetJobs,
  isDirectAtsUrl,
} from './_discovery.mjs';

// Fallback provider for branded/custom career pages.
//
// It keeps scan.mjs zero-token while covering the common case where a company
// hides Greenhouse/Ashby/Lever/Workday/etc. behind its own careers URL.

/** @type {Provider} */
export default {
  id: 'careers-page',

  detect(entry) {
    const url = entry.careers_url || '';
    if (!url || isDirectAtsUrl(url)) return null;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      return { url };
    } catch {
      return null;
    }
  },

  async fetch(entry, ctx) {
    const pageUrl = entry.careers_url;
    if (!pageUrl) throw new Error(`careers-page: missing careers_url for ${entry.name}`);

    const html = await ctx.fetchText(pageUrl);
    const targets = discoverAtsTargets(html, pageUrl);
    const jobs = [];
    const errors = [];

    for (const target of targets) {
      try {
        jobs.push(...await fetchDiscoveredTargetJobs(target, ctx, entry));
      } catch (err) {
        errors.push(`${target.provider}: ${err.message}`);
      }
    }

    if (jobs.length > 0) return dedupeJobs(jobs);

    const htmlJobs = extractHtmlJobs(html, pageUrl, entry);
    if (htmlJobs.length > 0) return htmlJobs;

    if (targets.length > 0 && errors.length > 0) {
      throw new Error(`careers-page: discovered ${targets.length} ATS target(s), but all failed (${errors.slice(0, 3).join('; ')})`);
    }

    return [];
  },
};
