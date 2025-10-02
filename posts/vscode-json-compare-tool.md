---
layout: layout.vto
title: A simple JSON sorting tool
description: "A simple JSON sorting tool got thousands of downloads"
bodyClass: me-page
---
# I made a vscode extension that got 4.5K+ downloads

A while ago at work I had to compare some JSON files to make sure the changes were what I expected—and I had to do this over and over.

Well, how do you do this as a developer? You use Git or a diff comparison tool in VS Code (if you’re used to using VS Code).  
As you might know, JSON files aren’t ordered like lists. It’s easy to lose the order, and then when you look at the diff it’s basically impossible to tell what actually changed.

What if there was a small tool that could **sort and compare** JSON so I wouldn’t need to think about *how* to sort it or *where* to compare it?  
That’s how, on a weekend, I decided to spend a couple of hours on this. Of course, with AI now you can achieve much more—and that’s how it helped me quickly create a **sort and compare plugin** for VS Code.

But the curiosity didn’t stop there. Now I had a plugin—how do I publish it on the VS Code Marketplace? Of course, AI will give you the steps, and on one of those steps you’re going to realize it’s easier to just follow the documentation. But come on, it’s Microsoft we’re talking about—so back to AI I went to try to make it work!

I eventually managed to publish it, and it felt good.  
You can install it from here:  
👉 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=farzan-tinati.json-sort-and-compare)

After a couple of weeks I was surprised that the extension was being downloaded about 20 times every day. I still can’t figure out why, but interestingly it has now been downloaded **4K+ times** since I created it in early 2024. That’s insane!

I have a hunch that it doesn’t matter how simple something is—if it solves a problem a lot of people have, it’s going to get attention. The hard part is finding that specific problem. I don’t think those people were even aware they were struggling with this. Maybe they knew but were too lazy to do something about it.

I can imagine that out of the 4.5 K people (and many more) who tried to find a JSON sort-and-compare extension, most gave up and did it manually when they didn’t find one. But if that happens enough times, you just get fed up and want to automate it.  
The mindset is important here: an engineer might think, *let’s just get it done, I can always build my own tools*, while an entrepreneur would see the **opportunity to build a tool for everyone**.

Here’s the GitHub repo—feel free to give it a ⭐ or add features!  
👉 [GitHub](https://github.com/pharzan/json-sort-compare-vscode)