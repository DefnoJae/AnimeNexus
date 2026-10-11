// Adapter for the resolver's parse-script JSON protocol.
package main

import (
    "encoding/json"
    "fmt"
    "os"
    "regexp"
    "github.com/fxnatic/jsd-solver-go/visitors"
    "github.com/t14raptor/go-fast/parser"
    "github.com/t14raptor/go-fast/generator"
)

func run() error {
    if len(os.Args) != 3 || os.Args[1] != "parse-script" { return fmt.Errorf("usage: jsdctl parse-script file.js") }
    body, err := os.ReadFile(os.Args[2]); if err != nil { return err }
    program, err := parser.ParseFile(string(body)); if err != nil { return err }
    result, err := visitors.DeobfuscateCf(program); if err != nil { return err }
    source := generator.Generate(program)
    site := regexp.MustCompile(`(?:window\.)?\s*_cf_chl_opt\s*=\s*\{\s*\w+:\s*['"]([^'"]+)['"]`).FindStringSubmatch(source)
    path := regexp.MustCompile(`/jsd/oneshot/([^'"` + "`" + `,\)\s]+)`).FindStringSubmatch(source)
    if len(site)<2 || len(path)<2 || len(result.LZAlphabet)<64 { return fmt.Errorf("unsupported challenge script: site=%t path=%t alphabetLength=%d",len(site)>=2,len(path)>=2,len(result.LZAlphabet)) }
    return json.NewEncoder(os.Stdout).Encode(map[string]any{"success":true,"sitekey":site[1],"path":path[1],"lz_alphabet":result.LZAlphabet})
}
func main() {
    if err := run(); err != nil { json.NewEncoder(os.Stdout).Encode(map[string]any{"success":false,"error":err.Error()}); os.Exit(1) }
}
