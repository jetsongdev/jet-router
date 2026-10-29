import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInvoice} from '../src/invoice.mjs';
test('one item',()=>assert.equal(createInvoice({customer:'Ada',lines:[{id:'a',quantity:1,unitMills:100000,taxBasisPoints:0}],discountCents:0}).totalCents,100));
test('two items',()=>assert.equal(createInvoice({customer:'Ada',lines:[{id:'a',quantity:1,unitMills:10000,taxBasisPoints:0},{id:'b',quantity:1,unitMills:20000,taxBasisPoints:0}],discountCents:0}).totalCents,30));
