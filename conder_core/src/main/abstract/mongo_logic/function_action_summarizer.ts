import { apply, DummyVisitor } from './visitor';
import { PickTargetNode } from './../IR';
import { ActionSequence } from './lock_calculation';
import { MongoNodeSet } from '../globals/mongo';
import { TargetNodeSet, NodeSet } from "../IR";
import { ScopeMap } from './scope_map';

type ActionSummarizer = (n: TargetNodeSet<MongoNodeSet>[]) => ActionSequence

export const MONGO_ACTION_SUMMARIZER: ActionSummarizer = (nodes) => {
    apply(nodes, new DummyVisitor())
    return []
}

type GlobalTaints = Set<string>
