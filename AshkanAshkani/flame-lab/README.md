# Flame Lab

An interactive, static website for exploring NASA's BASS–II experiments on the International Space Station and Saffire experiments aboard Cygnus.

- **ISS flame lab** offers adjustable acrylic film and rod models and two experiment replays.
- **Spacecraft fire** compares the Saffire I, III, and VI‑3 tests using approximate data from published plots and flight photographs.
- **Previous versions** opens the three earlier releases.

## Run locally

This site uses HTML, CSS, and JavaScript modules. It requires a web server and has no build step. With Python installed, open PowerShell in this folder and run:

```powershell
py -m http.server 8000
```

Visit [localhost:8000](http://localhost:8000).

## Sources

- [NASA BASS–II technical report](https://ntrs.nasa.gov/citations/20210011385)
- [NASA Saffire I results](https://ntrs.nasa.gov/citations/20170008805)
- [NASA Saffire I and III comparison](https://ntrs.nasa.gov/citations/20180005168)
- [NASA Saffire VI preliminary results](https://ntrs.nasa.gov/citations/20240007488)

The simulations use simplified models. The site labels flight reconstructions and hypothetical airflow cutoffs where they appear.
