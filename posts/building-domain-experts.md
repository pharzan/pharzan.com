---
layout: layout.vto
title: A Software Engineer’s Guide to Building Specialized Domain Products
description: "A look at how software engineers can learn just enough of the domain to collaborate with experts and make better product decisions."
bodyClass: me-page
date: 2025-11-16 16:53
tags: [domain-expertise, collaboration, product, engineering, teams]
---

# A Software Engineer’s Guide to Building Specialized Domain Products

When I joined a startup building software for a specialized industry, I thought my job was to write good code. But I learned that wasn't enough. Good code is part of the job, but that's not the real challenge—it was understanding what the code needed to do and understanding the problem from an engineer's perspective.

## The Problem with Not Knowing the Domain

You've probably heard the phrase "Give a man a hammer, and everything looks like a nail." I've seen this happen several times when developing features.
Software engineers can mistake something that looks like a data problem as a data problem and write everything to the database. On the other hand, engineers might take a simple data problem and try to calculate it dynamically when storing it would be simpler.

The zen here is being able to make the right decision. You need to take context from both sides and see which way is the efficient way to handle it. Do you want to store it in the database, or do you want to create a way to calculate it on the fly?

Here's the thing: domain experts often don't know what's possible with software, and software engineers often don't know what's possible in the domain.
Domain experts might suggest solutions based on their current constraints. "We need a form where we can enter all 50 parameters," they say, because that's how they've always done it.

But maybe you don't need all 50 parameters. Maybe you need 5, and the other 45 can be derived.
The expert sometimes misses this just because this is how they've always done it.

## How to Bridge the Gap

1. Learn Enough to Participate in the Conversations:

    You don't need to become a domain expert, but you need to know what they talk about and be able to take part in their conversations.
When the room is full of domain experts talking about the domain, you should be able to participate in the conversation. You need to know the big picture behind the topic. You can't just sit there as "just a software engineer." If you feel like you're bored, have no idea what the conversation is about, or have zero comments or questions—then you're not taking part in the conversation.


2. Don't Just Implement What Engineers Want You to Implement:

    I've made this mistake so many times—just doing what they wanted from me and implementing what they asked for, only to realize there was a better way to do it.
Here, you have to be able to understand the problem from a domain expert's perspective and realize their pain point. You need to be able to see the best solution from a software engineer's eyes and implement something that the end user would be happy with.
You need to be able to put on at least three hats.

3. Work Together on the Solution, Not in Sequence:

    The traditional approach is: domain expert defines requirements → software engineer implements → domain expert tests.
This approach doesn't really work. You have to find ways to create solutions together.
The tricky part is that you need domain knowledge, but you can't let domain experts dictate the implementation. Domain experts know their field. You know software. The solution lives at the intersection.
They might say: "We need to manually adjust these 20 values every time."
You should think: "Why are these values changing? Can we derive them? Can we automate this? What's the underlying rule?"
Sometimes the answer is: "No, they genuinely need manual control." But often, there's a better way that neither of you would have found alone.
In my experience, workshops to find solutions together and pair programming have been effective ways to figure out how to build small prototypes and expand on those gradually. I've written more on [Sharing Domain Knowledge and Building Better Teams](https://pharzan.com/posts/pair-programming/)

## You Don't Have to Know Everything

Remember: there will be moments when you don't understand something, and that's okay. Be humble and accept it. Or you can cheat a little and fake it—but being honest builds more trust in the long run.

## Conclusion
When you're building a complex piece of software, the team handling this should be able to see it from three different people's eyes:

- The domain expert: What they are trying to solve
- The software engineer: How they are trying to implement it in an optimized way
- The end user: How this will solve their problem

If you get enough context on each side of the problem, then the solution you build will be to the point and spot on
