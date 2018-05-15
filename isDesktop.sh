#!/usr/bin/env bash

check_if_desktop (){
  IS_DESKTOP="false"

  displayManager=(
    'xserver-common' # X Window System (X.Org) infrastructure
    'xwayland' # Xwayland X server
  )
  for i in "${displayManager[@]}"; do
    dpkg-query --show --showformat='${Status}\n' $i 2> /dev/null | grep "install ok installed" &> /dev/null
    if [[ $? -eq 0 ]]; then
      IS_DESKTOP="true"
    fi
  done
}

check_if_desktop

echo $IS_DESKTOP