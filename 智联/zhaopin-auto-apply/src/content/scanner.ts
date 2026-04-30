import type { ScannedJob } from '../shared/types';
import { SELECTORS, hasText } from './selectors';

// 从 URL 提取职位ID: CC{companyId}J{jobId}
function extractJobId(url: string): string {
  const match = url.match(/CC(\d+)J(\d+)/);
  return match ? `CC${match[1]}J${match[2]}` : url;
}

// 解析单张职位卡片
function parseJobCard(card: Element): ScannedJob | null {
  try {
    const titleLink = card.querySelector(SELECTORS.SEARCH.JOB_TITLE_LINK);
    if (!titleLink) return null;
    const detailUrl = titleLink.getAttribute('href') || '';
    const title = titleLink.textContent?.trim() || '';
    if (!title || !detailUrl) return null;

    const allText = Array.from(card.querySelectorAll('p, span, div, li, a'))
      .map((el) => el.textContent?.trim())
      .filter((t): t is string => !!t && t.length > 1);

    const salary =
      card.querySelector(SELECTORS.SEARCH.SALARY)?.textContent?.trim() ||
      allText.find((t) => /\d+k/i.test(t) || /\d+[千万]/.test(t) || /元/.test(t)) ||
      '面议';

    const companyLink = card.querySelector(SELECTORS.SEARCH.COMPANY_LINK);
    const company = companyLink?.textContent?.trim() ||
      allText.find((t) => t.length > 2 && t.length < 30 && !/[\dKk千万元]/.test(t)) ||
      '';

    const tagEls = card.querySelectorAll(SELECTORS.SEARCH.JOB_TAGS);
    const tags = Array.from(tagEls).map((el) => el.textContent?.trim()).filter(Boolean) as string[];

    const location = tags.find((t) => /[市区县]$/.test(t) || /^[一-龥]{2,}$/.test(t)) || '';
    const experience = tags.find((t) => /\d+年|应届|经验不限/.test(t)) || '';
    const education = tags.find((t) => /大专|本科|硕士|博士|学历不限/.test(t)) || '';

    const alreadyApplied = [...card.querySelectorAll('button, span, div, a')].some(
      (el) => el.textContent?.includes('已投递') || el.textContent?.includes('已申请')
    );

    return {
      id: extractJobId(detailUrl),
      title,
      salary,
      company,
      location,
      experience,
      education,
      tags,
      detailUrl: detailUrl.startsWith('http') ? detailUrl : `https://www.zhaopin.com${detailUrl}`,
      alreadyApplied,
      scannedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

// 后备方案：通过职位链接反向定位卡片容器
function findJobCardContainers(): Element[] {
  const links = document.querySelectorAll('a[href*="/jobdetail/"]');
  const containers = new Set<Element>();
  links.forEach((link) => {
    let el: Element | null = link.parentElement;
    for (let depth = 0; depth < 6 && el; depth++) {
      const text = el.textContent || '';
      if (
        text.length > 30 &&
        /\d/.test(text) &&
        (text.includes('万') || text.includes('千') || text.includes('元') || text.includes('K') || text.includes('k'))
      ) {
        containers.add(el);
        break;
      }
      el = el.parentElement;
    }
    if (!el) {
      el = link.parentElement?.parentElement?.parentElement || link.parentElement;
      if (el) containers.add(el);
    }
  });
  return Array.from(containers);
}

// 解析分页信息
function parsePagination(): { current: number; total: number } {
  const currentEl = document.querySelector(SELECTORS.SEARCH.PAGE_CURRENT);
  const current = currentEl ? parseInt(currentEl.textContent?.trim() || '1', 10) : 1;

  const allPageLinks = document.querySelectorAll('a[href*="/p"]');
  let maxPage = current;
  allPageLinks.forEach((link) => {
    const match = link.getAttribute('href')?.match(/\/p(\d+)/);
    if (match) {
      maxPage = Math.max(maxPage, parseInt(match[1], 10));
    }
  });

  return { current, total: maxPage };
}

// ===== 入口：扫描当前页面 =====

export interface ScanResult {
  jobs: ScannedJob[];
  pageNumber: number;
  totalPages: number;
  totalCount: number;
}

export function scanCurrentPage(): ScanResult {
  const cards = Array.from(document.querySelectorAll(SELECTORS.SEARCH.JOB_CARD));

  const elements =
    cards.length > 0 ? cards : findJobCardContainers();

  const seenIds = new Set<string>();
  const jobs: ScannedJob[] = [];
  elements.forEach((el) => {
    const job = parseJobCard(el);
    if (job && !seenIds.has(job.id)) {
      seenIds.add(job.id);
      jobs.push(job);
    }
  });

  const { current, total } = parsePagination();
  const totalCount = total * 20;

  return {
    jobs,
    pageNumber: current,
    totalPages: total,
    totalCount,
  };
}

// 批量扫描多页（返回所有职位汇总）
export async function scanMultiplePages(maxPages: number = 5): Promise<ScannedJob[]> {
  const allJobs: ScannedJob[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) {
      const pageLinks = document.querySelectorAll(`a[href*="/p${page}"]`);
      if (pageLinks.length > 0) {
        (pageLinks[0] as HTMLElement).click();
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        break;
      }
    }

    const { jobs } = scanCurrentPage();
    for (const job of jobs) {
      if (!seen.has(job.id)) {
        seen.add(job.id);
        allJobs.push(job);
      }
    }

    if (jobs.length < 20) break;
  }

  return allJobs;
}
