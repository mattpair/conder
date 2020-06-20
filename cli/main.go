package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"os"

	"./cmd"
)

func main() {
	name, err := cmd.Execute()
	if err != nil {
		println(err)
		return
	}
	file, err := os.Open(name)
	if err != nil {
		println(err)
		return
	}
	defer file.Close()

	out, err := http.Post("https://localhost:7344/upload", "application/zip", file)

	if err != nil {
		fmt.Println("error", err)
		return
	}
	defer out.Body.Close()
	if out != nil {
		fmt.Println(out)
	}
	body, err := ioutil.ReadAll(out.Body)

	if err != nil {
		fmt.Println("error", err)
	}
	if body != nil {
		fmt.Println(string(body[:]))
	}

	// cmd.Execute()
}
