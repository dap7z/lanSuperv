# lanSuperv Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).


## [0.3.0] - 2018-04-21
### Added
- multiple event transmission way with badges information
- time ago last response 
- plugin response notification

### Changed
- code refactoring
- events are now sended through gun.js database (socket.io removed)
- rely on the default network interface (no more the first active)


## [0.2.0] - 2017-09-23
### Added
- quick scan previously visibles computers first with ping command.

### Changed
- upgrade nodeJS to version 8.5 with await/async function and Map object support.
- some code refactoring and functions externalization.

### Fixed
- events redirections, for exemple to power-off another computer on wich the app is running too.


## [0.1.0] - 2017-09-08
### Added
- HTML view of your network extracted from nmap utility
- Plugin feature (exemple: 'wol', start up any computer of lan network)
- Gun.js decentralized database


Added/Changed/Fixed/Removed