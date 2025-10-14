---
layout: layout.vto
title: About Farzan Tinati
description: "Full-stack engineer in Oslo. I design and ship products end-to-end—from concept to cloud."
bodyClass: me-page
---

<section class="hero">
  <img class="hero-avatar" src="../assets/avatar-pixel.png" alt="Farzan Tinati" width="80" height="80" />
  <div class="hero-content">
    <h1 class="hero-title">Farzan Tinati</h1>
    <p class="hero-sub">
      Full-Stack Software Engineer • Oslo, Norway
    </p>
  </div>
</section>

[LinkedIn](https://linkedin.com/in/pharzan) | [Github](https://github.com/pharzan) | [PDF](../assets/Farzan-Tinati.pdf)

---
## Summary
Curious and product-oriented full-stack engineer looking for fast-moving startup environments. Designs and ships products end-to-end, from concept to cloud deployment with a strong record of fast prototyping, while writing clean, scalable code and collaborating across disciplines. Passionate about turning ideas into high-impact products.

---

## Professional skills

<div class="skills-dos">
  <div class="dos-columns">
    <div class="dos-menu">
      <button class="dos-folder active" data-folder="product">
        <span class="folder-bracket">[</span><span class="folder-name">PRODUCT</span><span class="folder-bracket">]</span>
      </button>
      <button class="dos-folder" data-folder="backend">
        <span class="folder-bracket">[</span><span class="folder-name">BACKEND</span><span class="folder-bracket">]</span>
      </button>
      <button class="dos-folder" data-folder="frontend">
        <span class="folder-bracket">[</span><span class="folder-name">FRONTEND</span><span class="folder-bracket">]</span>
      </button>
      <button class="dos-folder" data-folder="devops">
        <span class="folder-bracket">[</span><span class="folder-name">DEVOPS</span><span class="folder-bracket">]</span>
      </button>
      <button class="dos-folder" data-folder="interests">
        <span class="folder-bracket">[</span><span class="folder-name">INTERESTS</span><span class="folder-bracket">]</span>
      </button>
    </div>

    <div class="dos-viewer">
      <div class="dos-content-area">
        <div class="dos-panel active" data-panel="product">
<span class="dos-file-header">PROTOTYPING</span>
─────────────────────────
Fast prototyping and MVP development
<span class="dos-file-header">TEAMWORK</span>
─────────────────────────
Cross-disciplinary teamwork with engineers, designers, and product managers
<span class="dos-file-header">SUPPORT</span>
─────────────────────────
Pre-sales and post-sales technical support and onboarding
        </div>
        <div class="dos-panel" data-panel="backend">
<span class="dos-file-header">PYTHON</span>
─────────────────────────
  • FastAPI 
  • Pydantic
  • SQLAlchemy
  • Alembic
  • Pytest
<span class="dos-file-header">NODEJS</span>
─────────────────────────
  • Express
  • Knex
        </div>
        <div class="dos-panel" data-panel="frontend">
<span class="dos-file-header">FRAMEWORKS</span>
─────────────────────────
  • TypeScript
  • React, Next.js
  • Vue.js 
  • Three.js
  • Mapbox
  • Parametric design
        </div>
        <div class="dos-panel" data-panel="devops">
<span class="dos-file-header">INFRASTRUCTURE</span>
─────────────────────────
  • Terraform (IaC)
  • Docker
  • GitHub Actions (CI/CD)
  • GCP, Firebase, AWS
      </div>
        <div class="dos-panel" data-panel="interests">
<span class="dos-file-header">HOBBIES</span>
─────────────────────────
  • IoT prototyping with Arduino/Raspberry Pi
  • 3D printing and CAD/CAM modeling
  • AI agent automation
        </div>
      </div>
    </div>
  </div>
</div>

<script>
  document.addEventListener('DOMContentLoaded', function() {
    const dosContainer = document.querySelector('.skills-dos');
    if (!dosContainer) return;

    const folders = dosContainer.querySelectorAll('.dos-folder');
    const panels = dosContainer.querySelectorAll('.dos-panel');
    const pathElements = dosContainer.querySelectorAll('.current-path');

    folders.forEach(folder => {
      folder.addEventListener('click', () => {
        const targetPanel = folder.getAttribute('data-folder');

        // Update active states
        folders.forEach(f => f.classList.remove('active'));
        folder.classList.add('active');

        // Update panels
        panels.forEach(panel => {
          panel.classList.remove('active');
          if (panel.getAttribute('data-panel') === targetPanel) {
            panel.classList.add('active');
          }
        });

        // Update path in viewer
        const folderName = folder.querySelector('.folder-name').textContent;
        pathElements.forEach(el => el.textContent = folderName);

        if (window.umami && typeof window.umami.track === 'function') {
          window.umami.track('skills-folder-click', { folder: targetPanel });
        }
      });
    });
  });
</script>

---

## Experience
### Full-Stack Engineer — <a target="_blank" rel="noopener noreferrer" href="https://shapemaker.io"><span>Shapemaker</span></a>
*Oslo, Norway • Jul 2022 – Present*  
Cloud-based structural engineering design and analysis platform for telecommunication infrastructure  
- **Geometry & Modeling:** Created parametric structural modeling workflows to generate finite element models; Designed and automated cross-section geometry and property calculations to create a flexible system and to reduce system input data complexity.

- **Digital twin:** Built a 2D/3D visualization engine to display and render models in the browser via
communication over REST API. This resulted in rendering becoming 4× faster from the initial
MVP and created interactive 2D technical drawings of telecom structures.

- **Cross-disciplinary collaboration:** Worked with structural engineers, driving the product from initial concept to a scalable solution while solving complex engineering problems.

- Built an automated structural-analysis module that eliminated roughly two days of manual preparation per new customer, reducing data onboarding time and lowering customer-acquisition cost.


### Lead Full-Stack Developer — <a target="_blank" rel="noopener noreferrer" href="https://justsnap.co">Justsnap</a>
*Istanbul, Turkey • Aug 2020 – Sep 2022*  
Designed a configurable, template-based campaign website generator serving 10+ retail promotions every month.  
- **Site-Builder:** Designed and implemented a template-driven rendering engine that accepts configurable campaign data and composes dynamic UI layouts on the fly, powering a site-builder–style platform for marketing campaigns. Integrated interactive dashboards, automated receipt processing, and advanced data-visualization features

- **Chatbot:** Developed configurable Facebook Messenger chatbots, working with various APIs and webhooks to create flexible, scenario-based chat bots.

- Integrated payment APIs to fully automate end-user payments.

*(Earlier roles include Full-Stack Developer at Varman, Frontend Developer at Voscreen, and Web Developer at Walltion.)*

---

## Education
- **B.Sc. Mechanical Engineering** — Azad University of Tabriz  
- **A.Sc. Computer Software Engineering** — University of Shabestar  

---

## Projects & Interests
- **Hardware Hacking & IoT:** Prototyping with Arduino, Raspberry Pi, and 3D printers to automate and optimize everyday tasks.  
- Continuously exploring tools and open-source software and hardware to build meaningful side projects.
