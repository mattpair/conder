import { string_to_environment } from "../../index"


test("main", () => {
    expect(string_to_environment(`
    struct Shout {
        content: string 
    }
    
    public function echo(s: Shout) Shout {
        return s
    }
    
    public function doesNothing(s: Shout) {
        
    }
    
    struct WithOptional {
        content: string 
        maybeNum: Optional<int>
        maybeShout: Optional<Shout>
    }
    
    WithOptionals: Array<WithOptional> = []
    
    public function tryOptional(m: WithOptional) WithOptional {
        return m
    }
    
    public function storeOptionals(m: WithOptional) {
        WithOptionals.append([m])
    }
    
    public function getOptionals() Array<WithOptional> {
        return WithOptionals
    }
    
    ShoutStore: Array<Shout> = []
    
    public function saveShout(s: Shout) {
        ShoutStore.append([s])
    }
    
    public function manyEcho(ss: Array<Shout>) Array<Shout> {
        return ss
    }
    
    public function getSavedShouts() Array<Shout> {
        return ShoutStore
    }
    
    struct ShoutFolder {
        history: Array<Shout>
    }
    
    folders: Array<ShoutFolder> = []
    
    public function internalArrayLen(i: ShoutFolder): int {
        return i.history.len()
    }
    
    public function saveManyShouts(f: ShoutFolder) {
        folders.append([f])
    }
    
    public function getFolders() Array<ShoutFolder> {
        return folders
    }
    
    enum AnimalType {
        Amphibian,
        Reptile,
        Mammal,
        Bird
    }
    
    struct Animal {
        name: string
        kind: AnimalType
    }
    
    zoo: Array<Animal> = []
    
    public function protect(a: Animal) {
        zoo.append([a])
    }
    
    public function release() Array<Animal> {
        return zoo
    }
    
    public function intermediate(): Array<Animal> {
        i1 : Array<Animal> = zoo
        i2 : Array<Animal> = i1
        return i2
    }
    
    struct Present {
        s: string
    }
    
    struct Gift {
        inside: Present 
    }
    
    public function unwrap(g: Gift): Present {
        return g.inside
    }
    
    public function primitiveFunc(i: Array<int>): Array<int> {
        return i
    }
    
    presents: Array<Present> = []
    
    public function insertPres(p: Array<Present>) {
        presents.append(p)
    }
    
    public function getRefs(): Array<&Present> {
        return presents.select(row => {
            return row.ref()
        })
    }
    
    public function deref(r: &Present): Optional<Present> {
        return r.deref()
    }
    
    public function del(r: &Present): bool {
        return r.delete()
    }
    
    public function objectify(input: string): Present {
        return {
            s: input
        }
    }
    
    struct measurement {
        length: int
    }
    
    public function chained_measure(): measurement {
        return {
            length: presents.select(row => {
                return row
            }).len()
        }
    }
    
    public function measure(i: Array<string>): int {
        return i.len()
    }
    
    public function measureGlobal(): int {
        return presents.len()
    }
    
    struct nestedInts {
        arr: Array<int>
    }
    
    intInts: Array<nestedInts> = []
    
    public function addNest(): Array<&nestedInts> {
        return intInts.append([{arr: []}])
    }
    
    public function addToInstance(arg: &nestedInts): Optional<nestedInts> {
        return arg.deref(row => {
            row.arr.append([1, 2, 3])
            return row
        })
    }
    
    struct anotherMessage {
        m: string
    }
    
    public function other(s: anotherMessage) anotherMessage {
        return s
    }`)).toMatchSnapshot()
})