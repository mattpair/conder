

export type ConduitBuildConfig = {
    project: string;
    dependents?: {
        [path in string]: {
            language: "typescript";
        };
    };
};


export type WrittenCode = { 
    backend: {main: ContainerSpec, postgres: ContainerSpec}
}

export type ContainerSpec = {
    docker: string, 
    files: {name: string, content: string}[]
}