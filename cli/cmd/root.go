package cmd

import (
	"archive/zip"
	"fmt"
	"io/ioutil"
	os "os"

	"github.com/spf13/cobra"
)

var (
	rootCmd = &cobra.Command{
		Use:   "conduit",
		Short: "A CLI for compiling and deploying conduit projects",
	}
)

// Execute executes the root command.
func Execute() error {

	// Get a Buffer to Write To
	os.Mkdir(`.conduit/`, os.FileMode(0777))
	outFile, err := os.Create(`.conduit/upload.zip`)
	if err != nil {
		fmt.Println(err)
	}
	defer outFile.Close()
	w := zip.NewWriter(outFile)

	d, _ := os.Getwd()
	// Add some files to the archive.
	addFiles(w, d, "")

	if err != nil {
		fmt.Println(err)
	}

	// Make sure to check the error on Close.
	err = w.Close()
	if err != nil {
		fmt.Println(err)
	}

	return rootCmd.Execute()
}

func addFiles(w *zip.Writer, basePath, baseInZip string) {
	// Open the Directory
	files, err := ioutil.ReadDir(basePath)
	if err != nil {
		fmt.Println(err)
	}

	for _, file := range files {
		fmt.Println(basePath + file.Name())
		if !file.IsDir() {
			dat, err := ioutil.ReadFile(basePath + file.Name())
			if err != nil {
				fmt.Println(err)
			}

			// Add some files to the archive.
			f, err := w.Create(baseInZip + file.Name())
			if err != nil {
				fmt.Println(err)
			}
			_, err = f.Write(dat)
			if err != nil {
				fmt.Println(err)
			}
		} else if file.IsDir() {

			// Recurse
			newBase := basePath + "/" + file.Name() + "/"
			fmt.Println("Recursing and Adding SubDir: " + file.Name())
			fmt.Println("Recursing and Adding SubDir: " + newBase)

			addFiles(w, newBase, baseInZip+file.Name()+"/")
		}
	}
}
