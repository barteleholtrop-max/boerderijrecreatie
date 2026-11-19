// Claude-werkruimte (8 november 2026): een persoonlijke sleutel (sk-ant-usr-…) werkt alleen met het werkruimte-ID in de kop
// anthropic-workspace-id. Zonder die kop weigerde Claude elk verzoek van de Weekassistent en de Backoffice-assistent.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const W=await import('../lib/claude-workspace.ts');

test('werkruimte-ID: alleen een geldig wrkspc_-ID geeft de kop',()=>{
 assert.deepEqual(W.workspaceHeaders('wrkspc_01FDNUJ5EUeK9A6KQcqUvrn9'),{'anthropic-workspace-id':'wrkspc_01FDNUJ5EUeK9A6KQcqUvrn9'});
 assert.deepEqual(W.workspaceHeaders('  wrkspc_01FDNUJ5EUeK9A6KQcqUvrn9 '),{'anthropic-workspace-id':'wrkspc_01FDNUJ5EUeK9A6KQcqUvrn9'},'spaties weg');
 for(const bad of ['',null,undefined,'onzin','wrkspc_','wrkspc_abc def','sk-ant-usr-geheim','wrkspc_01\r\nX-Evil: 1'])assert.equal(W.workspaceHeaders(bad),undefined,String(bad));
});
test('de weigering van Claude zonder werkruimte wordt herkend',()=>{
 assert.ok(W.missingWorkspace('400 {"type":"error","error":{"type":"invalid_request_error","message":"This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header"}}'));
 assert.ok(!W.missingWorkspace('model not found'));assert.ok(!W.missingWorkspace(undefined));
 assert.match(W.MISSING_WORKSPACE_TEXT,/werkruimte-ID/);assert.match(W.MISSING_WORKSPACE_TEXT,/Systeem & koppelingen/);
});
