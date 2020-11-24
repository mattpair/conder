import { ActionSequence, calculate_lock_requirements, LockRequirements } from './lock_calculation';
import { MongoNodeSet } from '../globals/mongo';
import { TargetNodeSet, NodeSet } from "../IR";
import { ScopeMap } from '../../data_structures/scope_map';
import { MONGO_ACTION_SUMMARIZER } from './action_summarizer';

type LockCalculator = (input: Map<string, TargetNodeSet<MongoNodeSet>[]>) =>  Map<string, LockRequirements[string]>

export const MONGO_LOCK_CALCULATOR: LockCalculator = input => {
    
    const actions: Record<string, ActionSequence> = {}
    input.forEach((v, k) => {
        actions[k] = MONGO_ACTION_SUMMARIZER(v)
    })
    const locks = calculate_lock_requirements(actions)
    
    return new Map(Object.entries(locks))
}

