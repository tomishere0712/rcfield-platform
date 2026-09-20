/* eslint-disable no-console */
/**
 * Test KB retrieval accuracy for a cafe.
 *
 * Usage:
 *   npm run test:kb -- --cafe <cafeId> --query "câu hỏi của bạn"
 *
 * Optional:
 *   --top <n>        Number of chunks to retrieve (default: 5)
 *   --threshold <n>  Only show chunks with similarity >= n (default: 0)
 */
import 'dotenv/config';
import { AppDataSource } from '../config/database';
import { kbService } from '../services/kb.service';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';

function scoreBar(score: number): string {
  const pct = Math.round(score * 20);
  const bar = '█'.repeat(pct) + '░'.repeat(20 - pct);
  const color = score >= 0.7 ? GREEN : score >= 0.4 ? YELLOW : RED;
  return `${color}${bar}${RESET} ${score.toFixed(3)}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };
  return {
    cafeId: get('--cafe') ?? get('-c'),
    query: get('--query') ?? get('-q'),
    top: parseInt(get('--top') ?? '5', 10),
    threshold: parseFloat(get('--threshold') ?? '0'),
  };
}

async function main() {
  const { cafeId, query, top, threshold } = parseArgs();

  if (!cafeId || !query) {
    console.error(`${RED}Usage: npm run test:kb -- --cafe <cafeId> --query "câu hỏi"${RESET}`);
    process.exit(1);
  }

  await AppDataSource.initialize();
  const ds = AppDataSource;

  // ── 1. Show KB summary for this cafe ───────────────────────────
  const [docStats] = await ds.query<
    { doc_count: string; chunk_count: string; indexed: string; failed: string }[]
  >(
    `
    SELECT
      COUNT(DISTINCT d.id)                                    AS doc_count,
      COUNT(c.id)                                             AS chunk_count,
      COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'INDEXED') AS indexed,
      COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'FAILED')  AS failed
    FROM kb_documents d
    LEFT JOIN kb_chunks c ON c.document_id = d.id
    WHERE d.cafe_id = $1 AND d.deleted_at IS NULL
  `,
    [cafeId],
  );

  console.log(`\n${BOLD}${CYAN}── KB Summary ─────────────────────────────────────────${RESET}`);
  console.log(`  Cafe ID  : ${DIM}${cafeId}${RESET}`);
  console.log(
    `  Documents: ${docStats.doc_count} total  ${GREEN}${docStats.indexed} indexed${RESET}  ${RED}${docStats.failed} failed${RESET}`,
  );
  console.log(`  Chunks   : ${docStats.chunk_count}`);

  if (parseInt(docStats.chunk_count) === 0) {
    console.log(
      `\n${YELLOW}⚠ No chunks found — upload a document first (POST /api/v1/cafes/:cafeId/kb/documents)${RESET}\n`,
    );
    process.exit(0);
  }

  // ── 2. Embed query ──────────────────────────────────────────────
  console.log(`\n${BOLD}${CYAN}── Query ───────────────────────────────────────────────${RESET}`);
  console.log(`  "${query}"`);
  process.stdout.write(`\n  Embedding query...`);

  const queryEmbedding = await kbService.embedText(query);
  process.stdout.write(` ${GREEN}done${RESET} (${queryEmbedding.length} dims)\n`);

  // ── 3. Retrieve with scores ─────────────────────────────────────
  const rows = await ds.query<
    { chunk_text: string; doc_title: string; chunk_index: number; score: number }[]
  >(
    `
    SELECT
      c.chunk_text,
      c.chunk_index,
      d.title       AS doc_title,
      1 - (c.embedding <=> $2::vector) AS score
    FROM kb_chunks c
    JOIN kb_documents d ON c.document_id = d.id
    WHERE c.cafe_id = $1
    ORDER BY c.embedding <=> $2::vector
    LIMIT $3
  `,
    [cafeId, JSON.stringify(queryEmbedding), top],
  );

  const filtered = rows.filter((r) => r.score >= threshold);

  console.log(
    `\n${BOLD}${CYAN}── Top ${top} Chunks (cosine similarity)${threshold > 0 ? `  threshold ≥ ${threshold}` : ''} ─────${RESET}`,
  );

  if (!filtered.length) {
    console.log(`  ${RED}No chunks above threshold ${threshold}${RESET}`);
  }

  filtered.forEach((row, i) => {
    const preview = row.chunk_text.replace(/\s+/g, ' ').slice(0, 120);
    console.log(`\n${BOLD}[${i + 1}]${RESET} ${scoreBar(row.score)}`);
    console.log(`     ${DIM}${row.doc_title}  (chunk #${row.chunk_index})${RESET}`);
    console.log(`     ${preview}${row.chunk_text.length > 120 ? '…' : ''}`);
  });

  // ── 4. Verdict ──────────────────────────────────────────────────
  const best = filtered[0]?.score ?? 0;
  console.log(`\n${BOLD}${CYAN}── Verdict ─────────────────────────────────────────────${RESET}`);
  if (best >= 0.7) {
    console.log(
      `  ${GREEN}✓ Good match (${best.toFixed(3)}) — KB likely has relevant info for this query.${RESET}`,
    );
  } else if (best >= 0.4) {
    console.log(
      `  ${YELLOW}~ Weak match (${best.toFixed(3)}) — LLM may produce vague answers. Consider adding more docs.${RESET}`,
    );
  } else {
    console.log(
      `  ${RED}✗ No match (${best.toFixed(3)}) — KB has no info on this topic. LLM will say "không biết".${RESET}`,
    );
  }

  console.log('');
  await ds.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
