#!/bin/sh
# All paths are positional arguments, never interpolated as shell source.
pid=$1
staged=$2
target=$3
backup=$4
result=$5
success=$6
failure=$7
ready=$8
profile=$9
printf ready > "$ready" || exit 1
count=0
while kill -0 "$pid" 2>/dev/null; do
  count=$((count + 1))
  if [ "$count" -ge 120 ]; then
    printf '%s' "$failure" > "$result.tmp" && /bin/mv -f "$result.tmp" "$result"
    exit 1
  fi
  sleep 1
done
write_result() {
  printf '%s' "$1" > "$result.tmp" && /bin/mv -f "$result.tmp" "$result"
}
if [ -e "$backup" ] || [ ! -d "$staged" ] || [ ! -d "$target" ]; then
  write_result "$failure"
  exit 1
fi
if ! /bin/mv "$target" "$backup"; then
  write_result "$failure"
  /usr/bin/open -n "$target" --args "--user-data-dir=$profile"
  exit 1
fi
if ! /bin/mv "$staged" "$target"; then
  /bin/mv "$backup" "$target"
  write_result "$failure"
  /usr/bin/open -n "$target" --args "--user-data-dir=$profile"
  exit 1
fi
write_result "$success"
if ! /usr/bin/open -n "$target" --args "--user-data-dir=$profile"; then
  /bin/mv "$target" "$staged"
  /bin/mv "$backup" "$target"
  write_result "$failure"
  /usr/bin/open -n "$target" --args "--user-data-dir=$profile"
  exit 1
fi
