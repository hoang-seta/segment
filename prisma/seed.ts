import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Create a sample user
    const user = await prisma.user.create({
        data: {
            email: 'john@example.com',
            name: 'John Doe',
        },
    });

    console.log('Created user:', user);

    // Create a sample post
    const post = await prisma.post.create({
        data: {
            title: 'My First Post',
            content: 'This is the content of my first post.',
            published: true,
            authorId: user.id,
        },
    });

    console.log('Created post:', post);

    // Fetch all users with their posts
    const usersWithPosts = await prisma.user.findMany({
        include: {
            posts: true,
        },
    });

    console.log('Users with posts:', JSON.stringify(usersWithPosts, null, 2));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });


