import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canMove} from '../lib/work-status.ts';
test('werkstatus volgt nieuw, behandeling, gereed en kan expliciet heropend worden',()=>{assert.equal(canMove('nieuw','behandeling'),true);assert.equal(canMove('behandeling','gereed'),true);assert.equal(canMove('gereed','behandeling'),true)});
test('geen overslaan, ongekende status of dubbele overgang',()=>{for(const pair of [['nieuw','gereed'],['nieuw','nieuw'],['gereed','nieuw'],['behandeling','betaald'],['unknown','behandeling']])assert.equal(canMove(...pair),false)});
