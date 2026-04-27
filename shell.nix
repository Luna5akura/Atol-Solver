{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  packages = with pkgs; [
    emscripten
    nodejs
    pnpm
    python3
    git
  ];

  shellHook = ''
    export CC=emcc
    export CXX=em++
    export AR=emar
    export RANLIB=emranlib
    export CC_wasm32_unknown_emscripten=emcc
    export CXX_wasm32_unknown_emscripten=em++
    export AR_wasm32_unknown_emscripten=emar
    export RANLIB_wasm32_unknown_emscripten=emranlib

    echo "Puzzle workspace dev shell"
    echo "Checking key tools..."
    command -v emcc >/dev/null && echo "  emcc: $(command -v emcc)"
    command -v em++ >/dev/null && echo "  em++: $(command -v em++)"
    command -v node >/dev/null && echo "  node: $(command -v node)"
    command -v pnpm >/dev/null && echo "  pnpm: $(command -v pnpm)"
  '';
}
