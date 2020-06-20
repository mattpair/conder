package main

import (
	// "./cmd"
	"fmt"
	"io/ioutil"
	"net/http"
)

func main() {
	out, err := http.Get("https://localhost:7344")
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
		fmt.Println(out)
	}

	// cmd.Execute()
}
