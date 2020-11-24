import { apply, DummyVisitor, Subscriptions } from './visitor';
import { ActionSequence, LockRequirements } from './lock_calculation';
import { MongoNodeSet } from '../globals/mongo';
import { TargetNodeSet, NodeSet } from "../IR";
import { ScopeMap } from './scope_map';

type LockCalculator = (n: TargetNodeSet<MongoNodeSet>[]) => LockRequirements

export const MONGO_LOCK_CALCULATOR: LockCalculator = (n) => {

    return {}
}