import { DefaultMap } from './default_map';

export class StickSet<T> {
    private readonly map: DefaultMap<T, number> 

    constructor() {
        this.map = new DefaultMap(() => 0)
    }
    
    add(t: T): this {
        const current_number = this.map.get(t)
        this.map.set(t, current_number + 1)
        return this
    }

    delete(t: T): boolean {
        const current_number = this.map.get(t)
        if (current_number === 1) {
            this.map.delete(t)
        } else if (current_number === 0) {
            return false
        } else {
            this.map.set(t, current_number - 1)
        } 
        return true
    }
}