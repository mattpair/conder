
export type WrittenCode = { 
    backend: {main: ContainerSpec, postgres: ContainerSpec}
}

export type ContainerSpec = {
    docker: string, 
    files: {name: string, content: string}[]
}