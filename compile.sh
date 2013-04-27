#!/bin/bash
other_args="$1"
coffee $other_args -c -o js/ -j http-vis.js ./src/*.coffee

