import { CHILD_COVERAGE_VARIABLE } from './childProcessCoverage';

const childCoverage = process.env[CHILD_COVERAGE_VARIABLE];
if (childCoverage) process.env['NODE_V8_COVERAGE'] = childCoverage;
