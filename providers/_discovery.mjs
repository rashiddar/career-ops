// Shared ATS discovery helpers for provider plugins.
// Files prefixed with _ are never loaded as providers by scan.mjs.

const MAX_PAGES_PER_TARGET = 5;
const WORKDAY_PAGE_SIZE = 20;
const SMARTRECRUITERS_PAGE_SIZE = 100;

const GENERIC_LINK_TEXT = new Set([
  'apply',
  'apply now',
  'back',
  'careers',
  'career',
  'departments',
  'explore jobs',
  'find jobs',
  'job alerts',
  'job openings',
  'jobs',
  'join us',
  'learn more',
  'life at',
  'locations',
  'open positions',
  'opportunities',
  'read more',
  'search',
  'search jobs',
  'see all jobs',
  'submit application',
  'view all',
  'view all jobs',
  'view jobs',
  'view openings',
  'view positions',
]);

const DEDICATED_PROVIDER_HOST_PATTERNS = [
  /(^|\.)ashbyhq\.com$/i,
  /(^|\.)greenhouse\.io$/i,
  /(^|\.)lever\.co$/i,
];

const KNOWN_ATS_HOST_PATTERNS = [
  ...DEDICATED_PROVIDER_HOST_PATTERNS,
  /(^|\.)myworkdayjobs\.com$/i,
  /(^|\.)myworkdaysite\.com$/i,
  /(^|\.)smartrecruiters\.com$/i,
  /(^|\.)bamboohr\.com$/i,
  /(^|\.)teamtailor\.com$/i,
];

export function isDirectAtsUrl(url) {
  try {
    const { hostname } = new URL(url);
    return DEDICATED_PROVIDER_HOST_PATTERNS.some(pattern => pattern.test(hostname));
  } catch {
    return false;
  }
}

export function cleanText(value) {
  return decodeHtmlEntities(String(value || ''))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeUrlCandidate(value) {
  return safeDecodeURIComponent(decodeHtmlEntities(String(value || '').trim()));
}

function absoluteUrl(href, baseUrl) {
  const normalized = normalizeUrlCandidate(href);
  if (!normalized || normalized.startsWith('mailto:') || normalized.startsWith('tel:')) return '';
  try {
    return new URL(normalized, baseUrl).href;
  } catch {
    return '';
  }
}

function slugifyTitle(title) {
  return cleanText(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function addTarget(targets, seen, target) {
  if (!target?.provider) return;
  const key = JSON.stringify(target);
  if (seen.has(key)) return;
  seen.add(key);
  targets.push(target);
}

function isLocaleSegment(segment) {
  return /^[a-z]{2}(?:-[A-Z]{2})?$/.test(segment || '');
}

function parseWorkdayUrl(rawUrl) {
  let url;
  try {
    url = new URL(normalizeUrlCandidate(rawUrl));
  } catch {
    return null;
  }

  if (!/(^|\.)myworkday(?:jobs|site)\.com$/i.test(url.hostname)) return null;

  const hostParts = url.hostname.split('.');
  const tenant = hostParts[0];
  const segments = url.pathname.split('/').filter(Boolean);
  let site = '';

  const recruitingIdx = segments.findIndex(segment => segment.toLowerCase() === 'recruiting');
  if (recruitingIdx !== -1 && segments[recruitingIdx + 2]) {
    site = segments[recruitingIdx + 2];
  } else if (segments[0] && isLocaleSegment(segments[0]) && segments[1]) {
    site = segments[1];
  } else if (segments[0]) {
    site = segments[0];
  }

  if (!tenant || !site || ['job', 'jobs', 'search', 'en-us'].includes(site.toLowerCase())) return null;

  return {
    provider: 'workday',
    host: url.hostname,
    tenant,
    site,
    url: `https://${url.hostname}/${site}`,
  };
}

export function discoverAtsTargets(text, baseUrl) {
  const haystack = normalizeUrlCandidate(`${baseUrl || ''}\n${text || ''}`);
  const targets = [];
  const seen = new Set();

  for (const match of haystack.matchAll(/https?:\/\/boards-api\.greenhouse\.io\/v1\/boards\/([A-Za-z0-9_-]+)\/jobs[^\s"'<>)]*/gi)) {
    addTarget(targets, seen, { provider: 'greenhouse', slug: match[1], apiUrl: match[0] });
  }
  for (const match of haystack.matchAll(/https?:\/\/(?:boards|job-boards(?:\.eu)?)\.greenhouse\.io\/([A-Za-z0-9_-]+)/gi)) {
    if (match[1].toLowerCase() === 'embed') continue;
    addTarget(targets, seen, { provider: 'greenhouse', slug: match[1] });
  }
  for (const match of haystack.matchAll(/greenhouse\.io\/embed\/(?:job_board|job_app)\?[^"'<>]*?\bfor=([A-Za-z0-9_-]+)/gi)) {
    addTarget(targets, seen, { provider: 'greenhouse', slug: match[1] });
  }

  for (const match of haystack.matchAll(/https?:\/\/api\.ashbyhq\.com\/posting-api\/job-board\/([^?/"'<>\\\s)]+)/gi)) {
    addTarget(targets, seen, { provider: 'ashby', slug: match[1] });
  }
  for (const match of haystack.matchAll(/https?:\/\/jobs\.ashbyhq\.com\/([^/?#"'<>\\\s)]+)/gi)) {
    addTarget(targets, seen, { provider: 'ashby', slug: match[1] });
  }

  for (const match of haystack.matchAll(/https?:\/\/api\.lever\.co\/v0\/postings\/([^?/"'<>\\\s)]+)/gi)) {
    addTarget(targets, seen, { provider: 'lever', slug: match[1] });
  }
  for (const match of haystack.matchAll(/https?:\/\/jobs\.lever\.co\/([^/?#"'<>\\\s)]+)/gi)) {
    addTarget(targets, seen, { provider: 'lever', slug: match[1] });
  }

  for (const match of haystack.matchAll(/https?:\/\/[A-Za-z0-9.-]+\.myworkday(?:jobs|site)\.com\/[^\s"'<>)]*/gi)) {
    addTarget(targets, seen, parseWorkdayUrl(match[0]));
  }

  for (const match of haystack.matchAll(/https?:\/\/(?:careers|jobs)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/gi)) {
    addTarget(targets, seen, { provider: 'smartrecruiters', slug: match[1] });
  }
  for (const match of haystack.matchAll(/https?:\/\/api\.smartrecruiters\.com\/v1\/companies\/([A-Za-z0-9_-]+)/gi)) {
    addTarget(targets, seen, { provider: 'smartrecruiters', slug: match[1] });
  }

  for (const match of haystack.matchAll(/https?:\/\/([A-Za-z0-9-]+)\.bamboohr\.com\/careers(?:\/list)?/gi)) {
    addTarget(targets, seen, { provider: 'bamboohr', slug: match[1] });
  }

  for (const match of haystack.matchAll(/https?:\/\/([A-Za-z0-9-]+)\.teamtailor\.com\/jobs(?:\.rss)?/gi)) {
    addTarget(targets, seen, { provider: 'teamtailor', slug: match[1] });
  }

  if (baseUrl) {
    addTarget(targets, seen, parseWorkdayUrl(baseUrl));
  }

  return targets;
}

export async function fetchDiscoveredTargetJobs(target, ctx, entry) {
  switch (target.provider) {
    case 'greenhouse':
      return fetchGreenhouseJobs(target, ctx, entry);
    case 'ashby':
      return fetchAshbyJobs(target, ctx, entry);
    case 'lever':
      return fetchLeverJobs(target, ctx, entry);
    case 'workday':
      return fetchWorkdayJobs(target, ctx, entry);
    case 'smartrecruiters':
      return fetchSmartRecruitersJobs(target, ctx, entry);
    case 'bamboohr':
      return fetchBambooHrJobs(target, ctx, entry);
    case 'teamtailor':
      return fetchTeamtailorJobs(target, ctx, entry);
    default:
      return [];
  }
}

async function fetchGreenhouseJobs(target, ctx, entry) {
  const apiUrl = target.apiUrl || `https://boards-api.greenhouse.io/v1/boards/${target.slug}/jobs`;
  const json = await ctx.fetchJson(apiUrl);
  const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
  return jobs.filter(j => j.absolute_url).map(j => ({
    title: cleanText(j.title),
    url: j.absolute_url,
    company: entry.name,
    location: cleanText(j.location?.name),
  }));
}

async function fetchAshbyJobs(target, ctx, entry) {
  const json = await ctx.fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${target.slug}?includeCompensation=true`);
  const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
  return jobs.map(j => ({
    title: cleanText(j.title),
    url: j.jobUrl || `https://jobs.ashbyhq.com/${target.slug}/${j.id || ''}`,
    company: entry.name,
    location: cleanText(j.location || j.locationName),
  })).filter(j => j.title && j.url);
}

async function fetchLeverJobs(target, ctx, entry) {
  const json = await ctx.fetchJson(`https://api.lever.co/v0/postings/${target.slug}?mode=json`);
  if (!Array.isArray(json)) return [];
  return json.map(j => ({
    title: cleanText(j.text),
    url: j.hostedUrl || j.applyUrl || '',
    company: entry.name,
    location: cleanText(j.categories?.location),
  })).filter(j => j.title && j.url);
}

async function fetchWorkdayJobs(target, ctx, entry) {
  const jobs = [];
  for (let page = 0; page < MAX_PAGES_PER_TARGET; page++) {
    const offset = page * WORKDAY_PAGE_SIZE;
    const apiUrl = `https://${target.host}/wday/cxs/${target.tenant}/${target.site}/jobs`;
    const json = await ctx.fetchJson(apiUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: `https://${target.host}`,
        referer: `https://${target.host}/en-US/${target.site}`,
      },
      body: JSON.stringify({
        appliedFacets: {},
        limit: WORKDAY_PAGE_SIZE,
        offset,
        searchText: '',
      }),
    });

    const postings = Array.isArray(json?.jobPostings)
      ? json.jobPostings
      : Array.isArray(json?.data?.jobPostings)
        ? json.data.jobPostings
        : [];

    for (const posting of postings) {
      const externalPath = posting.externalPath || posting.applyUrl || posting.url || '';
      const url = externalPath.startsWith('http')
        ? externalPath
        : `https://${target.host}${externalPath.startsWith('/') ? '' : '/'}${externalPath}`;
      jobs.push({
        title: cleanText(posting.title),
        url,
        company: entry.name,
        location: cleanText(posting.locationsText || posting.location || posting.primaryLocation),
      });
    }

    if (postings.length < WORKDAY_PAGE_SIZE) break;
  }
  return jobs.filter(j => j.title && j.url);
}

async function fetchSmartRecruitersJobs(target, ctx, entry) {
  const jobs = [];
  for (let page = 0; page < MAX_PAGES_PER_TARGET; page++) {
    const offset = page * SMARTRECRUITERS_PAGE_SIZE;
    const json = await ctx.fetchJson(`https://api.smartrecruiters.com/v1/companies/${target.slug}/postings?limit=${SMARTRECRUITERS_PAGE_SIZE}&offset=${offset}`);
    const postings = Array.isArray(json?.content) ? json.content : [];
    for (const posting of postings) {
      const title = cleanText(posting.name || posting.title);
      const id = posting.id || posting.uuid;
      const url = posting.ref || posting.url || posting.applyUrl ||
        (id && title ? `https://jobs.smartrecruiters.com/${target.slug}/${id}-${slugifyTitle(title)}` : '');
      const location = [
        posting.location?.city,
        posting.location?.region,
        posting.location?.country,
      ].filter(Boolean).join(', ');
      jobs.push({ title, url, company: entry.name, location: cleanText(location) });
    }
    if (postings.length < SMARTRECRUITERS_PAGE_SIZE) break;
  }
  return jobs.filter(j => j.title && j.url);
}

async function fetchBambooHrJobs(target, ctx, entry) {
  const json = await ctx.fetchJson(`https://${target.slug}.bamboohr.com/careers/list`);
  const postings = Array.isArray(json?.result) ? json.result : Array.isArray(json) ? json : [];
  return postings.map(posting => {
    const id = posting.id || posting.jobOpeningId;
    const title = cleanText(posting.jobOpeningName || posting.title);
    return {
      title,
      url: posting.jobOpeningShareUrl || (id ? `https://${target.slug}.bamboohr.com/careers/${id}/detail` : ''),
      company: entry.name,
      location: cleanText(posting.location?.name || posting.location),
    };
  }).filter(j => j.title && j.url);
}

async function fetchTeamtailorJobs(target, ctx, entry) {
  const xml = await ctx.fetchText(`https://${target.slug}.teamtailor.com/jobs.rss`);
  const jobs = [];
  for (const match of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const item = match[0];
    const title = cleanText((item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) || item.match(/<title>([\s\S]*?)<\/title>/i))?.[1]);
    const url = cleanText((item.match(/<link>([\s\S]*?)<\/link>/i) || [])[1]);
    const location = cleanText((item.match(/<teamtailor:location>([\s\S]*?)<\/teamtailor:location>/i) || [])[1]);
    jobs.push({ title, url, company: entry.name, location });
  }
  return jobs.filter(j => j.title && j.url);
}

export function extractHtmlJobs(html, baseUrl, entry) {
  return dedupeJobs([
    ...extractJsonLdJobs(html, baseUrl, entry),
    ...extractAnchorJobs(html, baseUrl, entry),
  ]);
}

function extractJsonLdJobs(html, baseUrl, entry) {
  const jobs = [];
  for (const match of String(html || '').matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = cleanJsonLd(match[1]);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const node of flattenJsonLd(parsed)) {
      const type = Array.isArray(node?.['@type']) ? node['@type'] : [node?.['@type']];
      if (!type.some(t => String(t).toLowerCase() === 'jobposting')) continue;
      const location = Array.isArray(node.jobLocation)
        ? node.jobLocation.map(readJobLocation).filter(Boolean).join('; ')
        : readJobLocation(node.jobLocation);
      const url = absoluteUrl(node.url || node.sameAs || baseUrl, baseUrl);
      jobs.push({
        title: cleanText(node.title),
        url,
        company: entry.name,
        location: cleanText(location),
      });
    }
  }
  return jobs.filter(j => j.title && j.url);
}

function cleanJsonLd(value) {
  return decodeHtmlEntities(String(value || '').trim())
    .replace(/^\s*<!--/, '')
    .replace(/-->\s*$/, '');
}

function flattenJsonLd(value) {
  const out = [];
  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    out.push(node);
    if (node['@graph']) visit(node['@graph']);
  };
  visit(value);
  return out;
}

function readJobLocation(location) {
  if (!location || typeof location !== 'object') return '';
  const address = location.address || {};
  return cleanText([
    address.addressLocality,
    address.addressRegion,
    address.addressCountry,
  ].filter(Boolean).join(', ') || location.name);
}

function extractAnchorJobs(html, baseUrl, entry) {
  const jobs = [];
  for (const match of String(html || '').matchAll(/<a\b([^>]*?)href\s*=\s*(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = `${match[1] || ''} ${match[4] || ''}`;
    const href = match[3];
    const title = cleanText(match[5]);
    const url = absoluteUrl(href, baseUrl);
    if (!isLikelyJobAnchor(title, url, attrs)) continue;
    jobs.push({ title, url, company: entry.name, location: '' });
  }
  return jobs;
}

function isLikelyJobAnchor(title, url, attrs) {
  if (!title || !url) return false;
  const lowerTitle = title.toLowerCase();
  if (title.length < 4 || title.length > 160) return false;
  const words = lowerTitle.match(/[a-z0-9]+/g) || [];
  if (words.length > 16) return false;
  if (words.length > 1 && new Set(words).size === 1) return false;
  if (GENERIC_LINK_TEXT.has(lowerTitle)) return false;
  if (/^(home|about|benefits|privacy|terms|cookie|contact|login|sign in)$/i.test(title)) return false;
  if (/[\.\?!]|\u2026/.test(title)) return false;
  if (/^(meet|life at|why|our|make your career|women|students|graduates|early careers)\b/i.test(title)) return false;
  if (/\b(we are|we're|you will|you'll|learn more|interactive network)\b/i.test(title)) return false;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    const lowerAttrs = String(attrs || '').toLowerCase();
    const hostIsAts = KNOWN_ATS_HOST_PATTERNS.some(pattern => pattern.test(parsed.hostname));
    const pathLooksJob = /\/(?:job|jobs|careers|career|position|positions|opening|openings|requisition|opportunit|vacanc|apply)\b/.test(path);
    const attrsLookJob = /\b(job|position|opening|career|requisition)\b/.test(lowerAttrs);
    return hostIsAts || pathLooksJob || attrsLookJob;
  } catch {
    return false;
  }
}

export function dedupeJobs(jobs) {
  const seen = new Set();
  const out = [];
  for (const job of jobs) {
    const title = cleanText(job.title);
    const url = String(job.url || '').trim();
    if (!title || !url) continue;
    const key = url || `${job.company || ''}::${title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title,
      url,
      company: job.company || '',
      location: cleanText(job.location),
    });
  }
  return out;
}
