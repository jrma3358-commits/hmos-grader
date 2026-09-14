// 사용: node src/cli.ts "질문 문장"
import { fQ } from './fq/index.ts';

const question = process.argv.slice(2).join(' ');
if (!question) {
  console.error('사용법: node src/cli.ts "질문 문장"');
  process.exit(1);
}

const result = fQ(question);
const { context, ...rest } = result.ok ? result : { context: undefined, ...result };
console.log(JSON.stringify(result.ok ? { ...rest, notes: context?.notes, relations: context?.relations } : result, null, 2));
