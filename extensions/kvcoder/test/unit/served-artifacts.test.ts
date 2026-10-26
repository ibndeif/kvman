import { describe, expect, it } from 'vitest';
import { deletedArtifactsText, servedIds } from '../../src/artifacts/served-artifacts.ts';

// Which url artifacts a background process served, and the line that tells the agent they went (ADR 0104, 1 and 4).

const url = (artifactId: string, content: string) => ({ artifactId, format: 'url' as const, content });

describe('the url artifacts a process served (ADR 0104)', () => {
  it('QA69-H5 several artifacts go in id order, and the line names them all', () => {
    const ids = servedIds([url('b-site', 'http://localhost:4173/'), url('a-site', 'http://127.0.0.1:4173/app')], ['http://localhost:4173/']);
    expect(ids).toEqual(['a-site', 'b-site']);
    expect(deletedArtifactsText(ids)).toBe('Its artifacts `a-site`, `b-site` were deleted, since nothing serves their address now.');
    expect(deletedArtifactsText(['preview'])).toBe('Its artifact `preview` was deleted, since nothing serves its address now.');
    expect(deletedArtifactsText([])).toBe('');
  });

  it('QA69-E5 only the port of a url artifact matches', () => {
    const artifacts = [
      url('same-port', 'http://127.0.0.1:4173/app'),
      url('other-port', 'http://localhost:8080'),
      url('no-port', 'http://localhost/'),
      url('secure-no-port', 'https://localhost/'),
      { artifactId: 'notes', format: 'markdown' as const, content: 'http://localhost:4173/' },
      { artifactId: 'page', format: 'html' as const, content: 'http://localhost:4173/' },
    ];
    expect(servedIds(artifacts, ['http://localhost:4173/'])).toEqual(['same-port']);
    expect(servedIds(artifacts, ['http://127.0.0.1:80/'])).toEqual(['no-port']);
    expect(servedIds(artifacts, ['http://localhost:443/'])).toEqual(['secure-no-port']);
    expect(servedIds(artifacts, [])).toEqual([]);
  });
});
